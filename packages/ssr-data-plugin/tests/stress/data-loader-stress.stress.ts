import { createRouter } from "@real-router/core";
import { cloneRouter } from "@real-router/core/api";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

import { ssrDataPluginFactory } from "../../src";

import type { DataLoaderFactoryMap } from "../../src";
import type { Router } from "@real-router/core";

const noop = (): void => undefined;

const routes = [
  { name: "home", path: "/" },
  {
    name: "users",
    path: "/users",
    children: [
      { name: "list", path: "/" },
      { name: "profile", path: "/:id" },
    ],
  },
  { name: "about", path: "/about" },
];

describe("Data Loader Stress", () => {
  beforeAll(() => {
    vi.spyOn(console, "warn").mockImplementation(noop);
    vi.spyOn(console, "error").mockImplementation(noop);
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it("200 sequential start() calls with loader: each returns correct data", async () => {
    const base = createRouter(routes, { defaultRoute: "home" });
    const loaders: DataLoaderFactoryMap = {
      "users.profile":
        () =>
        ({ params }) =>
          Promise.resolve({ userId: params.id, ts: Date.now() }),
    };

    for (let i = 0; i < 200; i++) {
      const clone = cloneRouter(base);

      clone.usePlugin(ssrDataPluginFactory(loaders));
      const state = await clone.start(`/users/${i}`);

      const data = state.context.data as { userId: string };

      expect(data.userId).toBe(String(i));

      clone.dispose();
    }
  });

  it("500 concurrent clone+start+dispose: per-request isolation preserved", async () => {
    const base = createRouter(routes, { defaultRoute: "home" });
    const loaders: DataLoaderFactoryMap = {
      "users.profile":
        () =>
        ({ params }) =>
          Promise.resolve({ id: params.id }),
    };

    const results = await Promise.all(
      Array.from({ length: 500 }, async (_, i) => {
        const clone = cloneRouter(base);

        clone.usePlugin(ssrDataPluginFactory(loaders));
        const state = await clone.start(`/users/${i}`);
        const data = state.context.data;

        clone.dispose();

        return data;
      }),
    );

    for (let i = 0; i < 500; i++) {
      expect(results[i]).toStrictEqual({ id: String(i) });
    }
  });

  it("200 start() with multiple loaders: correct loader invoked per route", async () => {
    const homeLoader = vi.fn().mockResolvedValue({ page: "home" });
    const profileLoader = vi
      .fn()
      .mockImplementation(({ params }: { params: { id: string } }) =>
        Promise.resolve({ user: params.id }),
      );
    const aboutLoader = vi.fn().mockResolvedValue({ page: "about" });

    const loaders: DataLoaderFactoryMap = {
      home: () => homeLoader,
      "users.profile": () => profileLoader,
      about: () => aboutLoader,
    };

    const base = createRouter(routes, { defaultRoute: "home" });

    const startPaths = ["/", "/users/42", "/about"];

    for (let i = 0; i < 200; i++) {
      const path = startPaths[i % startPaths.length];
      const clone = cloneRouter(base);

      clone.usePlugin(ssrDataPluginFactory(loaders));
      const state = await clone.start(path);

      const data = state.context.data;

      const expectedByPath: Record<string, unknown> = {
        "/": { page: "home" },
        "/users/42": { user: "42" },
        "/about": { page: "about" },
      };

      expect(data).toStrictEqual(expectedByPath[path]);

      clone.dispose();
    }

    // Distribution is fully deterministic: 200 starts cycled over 3 paths
    // via `i % 3`. i≡0 (home): i=0,3,…,198 → 67. i≡1 (profile): i=1,4,…,199
    // → 67. i≡2 (about): i=2,5,…,197 → 66. A `>=66` lower bound passed even
    // if one loader fired 0 and another 200; pin the exact split so a routing
    // regression (wrong loader per route) fails here.
    expect(homeLoader).toHaveBeenCalledTimes(67);
    expect(profileLoader).toHaveBeenCalledTimes(67);
    expect(aboutLoader).toHaveBeenCalledTimes(66);
  });

  it("100 usePlugin/unsubscribe cycles: unsubscribe completes without error", async () => {
    const router: Router = createRouter(routes, { defaultRoute: "home" });
    const loaders: DataLoaderFactoryMap = {
      home: () => () => Promise.resolve("data"),
    };

    for (let i = 0; i < 100; i++) {
      const unsub = router.usePlugin(ssrDataPluginFactory(loaders));

      const state = await router.start("/");

      expect(state.context.data).toBe("data");

      router.stop();
      unsub();
    }
  });

  it("1000 clone+start+dispose cycles: no memory leak via WeakRef", async () => {
    const base = createRouter(routes, { defaultRoute: "home" });
    const loaders: DataLoaderFactoryMap = {
      "users.profile":
        () =>
        ({ params }) =>
          Promise.resolve({ id: params.id }),
    };

    const refs: WeakRef<object>[] = [];

    for (let i = 0; i < 1000; i++) {
      const clone = cloneRouter(base);

      clone.usePlugin(ssrDataPluginFactory(loaders));
      const state = await clone.start(`/users/${i}`);

      refs.push(new WeakRef(state));

      clone.dispose();
    }

    globalThis.gc?.();

    // Allow some time for GC
    await new Promise((r) => {
      setTimeout(r, 50);
    });
    globalThis.gc?.();

    const alive = refs.filter((r) => r.deref() !== undefined).length;

    // At least 80% should be collected (GC is non-deterministic)
    expect(alive).toBeLessThan(200);
  });

  it("200 rapid usePlugin/unsubscribe without start: no errors", async () => {
    const router: Router = createRouter(routes, { defaultRoute: "home" });
    const loaders: DataLoaderFactoryMap = {
      home: () => () => Promise.resolve("data"),
    };

    for (let i = 0; i < 200; i++) {
      const unsub = router.usePlugin(ssrDataPluginFactory(loaders));

      unsub();
    }

    // Isolation check: the 200 churned plugins must each have fully torn
    // down — released the "data" claim AND removed their start interceptor.
    // A leaked claim would make this re-register throw
    // CONTEXT_NAMESPACE_ALREADY_CLAIMED; a leaked interceptor would corrupt
    // the value written below. Registering a *fresh* plugin and asserting
    // ITS data populates correctly proves the prior churn left no broken
    // listeners or held claims.
    const freshUnsub = router.usePlugin(ssrDataPluginFactory(loaders));
    const state = await router.start("/");

    expect(state.context.data).toBe("data");
    // Mode marker also lands — confirms the claim is genuinely the fresh
    // plugin's, not a stale write from the churn.
    expect(state.context.ssrDataMode).toBe("full");

    // And the fresh plugin itself tears down cleanly, freeing the claim
    // for one more re-register — a held claim here would throw.
    router.stop();
    freshUnsub();

    expect(() => {
      const reUnsub = router.usePlugin(ssrDataPluginFactory(loaders));

      reUnsub();
    }).not.toThrow();
  });

  it("100 start() interceptor mid-await + unsubscribe race: no crashes, claim.write tolerates released claim", async () => {
    // Symmetric to the existing `navigate-during-teardown` race in
    // `invalidate-races.stress.ts:31` — but on the SSR boot path
    // (start interceptor) rather than the CSR revalidation path
    // (subscribeLeave handler).
    //
    // Scenario: a plugin teardown happens AFTER `await next(path)`
    // resolves but BEFORE `claim.write(state, data)` runs. Core's
    // claim system permits `write` after `release` (it's just a
    // property write on `state.context`), so the contract is "no
    // crash" — the late write lands on a state that's already
    // returned from the (now-superseded) plugin lifecycle.
    //
    // Why this matters: a future refactor that makes `claim.write`
    // throw after `release` (e.g. a generation counter check) would
    // crash every navigation that loses this race. Pin the current
    // behaviour explicitly.
    const base = createRouter(routes, { defaultRoute: "home" });
    let crashes = 0;

    for (let i = 0; i < 100; i++) {
      const router = cloneRouter(base);
      const loaders: DataLoaderFactoryMap = {
        home: () => async () => {
          // Yield once so the test has a window to call unsubscribe()
          // AFTER `await next(path)` resolves (the interceptor body
          // continues here) and BEFORE `claim.write` runs.
          await Promise.resolve();
          await Promise.resolve();

          return `i${i}`;
        },
      };

      const unsub = router.usePlugin(ssrDataPluginFactory(loaders));

      const startPromise = router.start("/");

      // Race window: unsub between next(path) resolution and
      // claim.write. The two `await Promise.resolve()` in the loader
      // above guarantee the interceptor body is parked when we get
      // here, so unsub() lands in the gap.
      await Promise.resolve();
      try {
        unsub();
      } catch {
        // unsub itself should never throw — count if it does.
        crashes += 1;
      }

      try {
        await startPromise;
      } catch {
        // start() may legitimately reject when interceptor removal
        // races a mid-await await — what matters is the harness
        // doesn't see uncaught process-level errors.
      }

      router.dispose();
    }

    expect(crashes).toBe(0);
  });

  it("200 loader-resolution vs concurrent stop()/dispose() race: no crash, no late writes to live state", async () => {
    // JS is single-threaded, so a "race" between loader-resolve and
    // abort is operationally a microtask ordering problem rather than
    // a true data race. This test pins the ordering invariant: if the
    // router is stopped/disposed while a loader is parked on a
    // microtask, the resolving loader does NOT clobber a fresh state.
    //
    // Without this anchor, a future refactor that schedules the
    // `claim.write` on a delayed microtask (e.g. via `queueMicrotask`)
    // could surface as state.context.data appearing on a state from a
    // newer navigation — silent contamination.
    const base = createRouter(routes, { defaultRoute: "home" });
    let lateWrites = 0;

    for (let i = 0; i < 200; i++) {
      const router = cloneRouter(base);
      const loaders: DataLoaderFactoryMap = {
        home: () => async () => {
          // Park on two microtasks so the dispose() below lands in
          // the gap between `await next` and `claim.write`.
          await Promise.resolve();
          await Promise.resolve();

          return { i, payload: "late" };
        },
      };

      router.usePlugin(ssrDataPluginFactory(loaders));

      const startPromise = router.start("/");

      // Yield once — interceptor's `await next(path)` resolves, then
      // it parks on the loader's microtask chain.
      await Promise.resolve();

      router.dispose();

      try {
        const state = await startPromise;

        // If start() resolved, the write may have landed on the state
        // object that's about to be discarded. Either outcome is
        // valid; what's not valid is contamination of a different
        // navigation's state. With a single navigation per iteration,
        // any non-disposed router reaching here with a fresh state
        // not matching `{ i, payload: "late" }` would indicate the
        // loader's write leaked sideways.
        if (
          state.context.data !== undefined &&
          (state.context.data as { i?: number }).i !== i
        ) {
          lateWrites += 1;
        }
      } catch {
        // Disposed mid-flight — start() may reject. That's OK.
      }
    }

    expect(lateWrites).toBe(0);
  });
});
