import { getPluginApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";
import { describe, it, expect } from "vitest";

import { hydrateRouter, serializeRouterState } from "@real-router/ssr-utils";

import { createTestRouter } from "../helpers";

import type { Params, State } from "@real-router/core";

// Guard-free leaf routes rotated so every hydration drives a distinct path and
// a real transition. `admin.dashboard` is the dotted child of `admin`.
const HYDRATE_PATHS: { name: string; path: string; params?: Params }[] = [
  { name: "home", path: "/home" },
  { name: "users", path: "/users" },
  { name: "orders", path: "/orders" },
  { name: "items", path: "/items/7", params: { id: "7" } },
  { name: "admin.dashboard", path: "/admin/dashboard" },
];

const HYDRATE_CYCLES = 250;
const INTERCEPTOR_COUNT = 120;

// Build a server-serialized State JSON for a given path, carrying a non-trivial
// `context` payload so the hydration scratchpad holds real retained data (the
// thing a `finally`-restore leak would pin).
function makeServerJson(name: string, path: string, params: object): string {
  const serverState: State = {
    name,
    params: params as State["params"],
    path,
    context: {
      data: { fetchedAt: path, payload: "x".repeat(256) },
    },
    transition: {
      phase: "activating",
      reason: "success",
      segments: { deactivated: [], activated: [], intersection: "" },
    },
  };

  return serializeRouterState(serverState);
}

// These are correctness-under-load + invariant guards, NOT heap-leak guards.
// The hydration scratchpad leak (S15.1) is checked DIRECTLY via
// `getInternals(router).hydrationState === null` — a one-line invariant that
// fails the instant the `finally`-restore in hydrateRouter regresses, with zero
// heap-snapshot noise (per the CLAUDE.md stress-discrimination rule: prefer a
// direct invariant to a round-MB heap delta whenever one exists). A heap delta
// here would be theatre — the scratchpad holds exactly one SerializedRouterState
// (last-write-wins), so a restore-leak is hard-capped to a single generation and
// would never register against any MB threshold anyway.
describe("S15: start()/hydrateRouter cycles", () => {
  it("S15.1: 250 hydrate → stop → hydrate cycles — hydrationState restored to null every cycle, no scratchpad leak", async () => {
    const router = createTestRouter();

    // Pre-condition: scratchpad is null on a fresh router.
    expect(getInternals(router).hydrationState).toBeNull();

    let leakedCycles = 0;
    let wrongLanding = 0;

    for (let i = 0; i < HYDRATE_CYCLES; i++) {
      const target = HYDRATE_PATHS[i % HYDRATE_PATHS.length];
      const json = makeServerJson(
        target.name,
        target.path,
        target.params ?? {},
      );

      const result = await hydrateRouter(router, json);

      // (a) The committed state re-resolved the path on the client — name comes
      //     from matchPath, discriminating a hydrate-wiring regression.
      if (result.name !== target.name) {
        wrongLanding++;
      }

      // (b) DIRECT leak invariant: after hydrateRouter resolves, the `finally`
      //     in hydrateRouter must have restored hydrationState to its captured
      //     `previous` (null at top level). A skipped/broken restore would leave
      //     the parsed SerializedRouterState pinned here — caught immediately,
      //     no heap measurement needed.
      if (getInternals(router).hydrationState !== null) {
        leakedCycles++;
      }

      router.stop();

      // (c) stop() does not resurrect the scratchpad either.
      if (getInternals(router).hydrationState !== null) {
        leakedCycles++;
      }
    }

    // Not one of the 250 cycles leaked a non-null scratchpad across the
    // hydrate→stop boundary (the `previous` capture chain stayed balanced).
    expect(leakedCycles).toBe(0);
    expect(wrongLanding).toBe(0);

    // After 250 cycles the router still hydrates + commits correctly (the loop
    // ended on stop(), so getState() is undefined here — drive one more
    // hydration to prove the churned router is fully functional).
    const final = await hydrateRouter(
      router,
      makeServerJson("orders", "/orders", {}),
    );

    expect(final.name).toBe("orders");
    expect(router.getState()?.name).toBe("orders");
    expect(router.isActive()).toBe(true);

    // ...and that final hydration also left the scratchpad clean.
    expect(getInternals(router).hydrationState).toBeNull();

    router.dispose();
  }, 30_000);

  it("S15.1b: hydrate that REJECTS still restores hydrationState to null (finally on the error path) ×200", async () => {
    // allowNotFound:false so an unmatched path rejects ROUTE_NOT_FOUND, driving
    // hydrateRouter's `finally` on the rejection branch. The scratchpad must be
    // cleared identically whether start() resolves or throws — a restore that
    // only ran on success would pin state across every failed hydration.
    const router = createTestRouter({ allowNotFound: false });

    let leakedAfterReject = 0;
    let rejections = 0;

    for (let i = 0; i < 200; i++) {
      try {
        await hydrateRouter(router, { path: `/nonexistent-${i}` });
      } catch {
        rejections++;
      }

      if (getInternals(router).hydrationState !== null) {
        leakedAfterReject++;
      }
    }

    // Every attempt rejected, and every rejection left a clean (null) scratchpad.
    expect(rejections).toBe(200);
    expect(leakedAfterReject).toBe(0);
    expect(getInternals(router).hydrationState).toBeNull();

    // Router is still usable after 200 failed hydrations: a matching path commits.
    const ok = await hydrateRouter(router, { path: "/home" });

    expect(ok.name).toBe("home");
    expect(getInternals(router).hydrationState).toBeNull();

    router.stop();
    router.dispose();
  }, 30_000);

  it("S15.2: 120 start interceptors — all fire in LIFO order, start commits, no stack overflow", async () => {
    const router = createTestRouter();

    const callOrder: number[] = [];
    const removers: (() => void)[] = [];
    const api = getPluginApi(router);

    // Register 120 interceptors in ascending index order. Each records its index
    // BEFORE delegating to `next`, so callOrder captures the outer→inner
    // (pre-next) execution sequence of the onion chain.
    for (let i = 0; i < INTERCEPTOR_COUNT; i++) {
      const idx = i;

      removers.push(
        api.addInterceptor("start", (next, path) => {
          callOrder.push(idx);

          return next(path);
        }),
      );
    }

    // Also observe the scratchpad from the DEEPEST point of the chain to prove
    // the 120-deep wrapper stack does not corrupt hydration plumbing.
    let observedAtDepth: ReturnType<typeof getInternals>["hydrationState"] =
      null;

    removers.push(
      api.addInterceptor("start", (next, path) => {
        observedAtDepth = getInternals(router).hydrationState;

        return next(path);
      }),
    );

    const json = makeServerJson("orders", "/orders", {});
    const result = await hydrateRouter(router, json);

    // (a) start() drove all the way through the 121-deep interceptor chain and
    //     committed — no stack overflow, no swallowed call.
    expect(result.name).toBe("orders");
    expect(router.isActive()).toBe(true);

    // (b) Exactly the 120 indexed interceptors fired, once each.
    expect(callOrder).toHaveLength(INTERCEPTOR_COUNT);

    // (c) LIFO order: the last-registered indexed interceptor is the OUTERMOST
    //     wrapper, so it runs first. Expected pre-next order is
    //     [119, 118, ..., 1, 0]. (The depth-probe registered after them is the
    //     true outermost and does not push to callOrder.)
    const expectedLifo = Array.from(
      { length: INTERCEPTOR_COUNT },
      (_, i) => INTERCEPTOR_COUNT - 1 - i,
    );

    expect(callOrder).toStrictEqual(expectedLifo);

    // (d) The scratchpad was live at the bottom of the 121-deep chain (hydration
    //     plumbing survives arbitrary interceptor depth).
    expect(observedAtDepth).not.toBeNull();
    expect(observedAtDepth).toMatchObject({ name: "orders", path: "/orders" });

    // (e) Scratchpad cleared after start resolved through the whole chain.
    expect(getInternals(router).hydrationState).toBeNull();

    for (const remove of removers) {
      remove();
    }

    router.stop();
    router.dispose();
  }, 30_000);

  it("S15.3: large context scratchpad (200 namespaces) — fully observed during start, cleared after", async () => {
    // The scratchpad is what SSR loader plugins read to skip re-running their
    // loader on first paint. Stress it with a wide context (200 namespaces, each
    // a non-trivial payload) hydrated repeatedly: every namespace must be visible
    // to a start interceptor, and the whole structure must be released afterwards.
    const router = createTestRouter();

    const NAMESPACE_COUNT = 200;
    const context: Record<string, unknown> = {};

    for (let n = 0; n < NAMESPACE_COUNT; n++) {
      context[`ns${n}`] = { id: n, blob: `payload-${n}-${"y".repeat(64)}` };
    }

    const serverState: State = {
      name: "users",
      params: {},
      path: "/users",
      context,
      transition: {
        phase: "activating",
        reason: "success",
        segments: { deactivated: [], activated: [], intersection: "" },
      },
    };

    const json = serializeRouterState(serverState);

    let observedNamespaceCount = -1;
    let observedSampleOk = false;

    const removeInterceptor = getPluginApi(router).addInterceptor(
      "start",
      (next, path) => {
        const scratch = getInternals(router).hydrationState as
          | (State & { context: Record<string, { id: number; blob: string }> })
          | null;

        if (scratch) {
          observedNamespaceCount = Object.keys(scratch.context).length;
          // Spot-check first / middle / last namespace survived (de)serialization.
          observedSampleOk =
            scratch.context.ns0?.id === 0 &&
            scratch.context.ns100?.id === 100 &&
            scratch.context.ns199?.id === 199;
        }

        return next(path);
      },
    );

    // Hydrate the wide-context state 50× (stop between) — each must expose the
    // full namespace set and clear it afterwards.
    let everShort = false;

    for (let i = 0; i < 50; i++) {
      const result = await hydrateRouter(router, json);

      expect(result.name).toBe("users");

      if (observedNamespaceCount !== NAMESPACE_COUNT || !observedSampleOk) {
        everShort = true;
      }

      // Scratchpad cleared after each hydration regardless of context width.
      if (getInternals(router).hydrationState !== null) {
        everShort = true;
      }

      router.stop();
    }

    // All 200 namespaces were visible on every hydration, and the scratchpad was
    // released after each one (no per-cycle retention of the wide context).
    expect(everShort).toBe(false);
    expect(observedNamespaceCount).toBe(NAMESPACE_COUNT);
    expect(observedSampleOk).toBe(true);
    expect(getInternals(router).hydrationState).toBeNull();

    removeInterceptor();
    router.dispose();
  }, 30_000);
});
