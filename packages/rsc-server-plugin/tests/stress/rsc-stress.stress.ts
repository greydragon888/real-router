import { createRouter } from "@real-router/core";
import { cloneRouter, getLifecycleApi } from "@real-router/core/api";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

import { invalidate, rscServerPluginFactory } from "../../src";

import type { RscLoaderFactoryMap } from "../../src";
import type { Router } from "@real-router/core";
import type { ReactNode } from "react";

const noop = (): void => undefined;

const node = (kind: string, props: Record<string, unknown> = {}): ReactNode =>
  ({
    type: kind,
    props,
    key: null,
    $$typeof: Symbol.for("react.element"),
  }) as unknown as ReactNode;

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
  { name: "settings", path: "/settings" },
];

describe("RSC Loader Stress", () => {
  beforeAll(() => {
    vi.spyOn(console, "warn").mockImplementation(noop);
    vi.spyOn(console, "error").mockImplementation(noop);
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it("500 concurrent clone+start+dispose: per-request isolation preserved", async () => {
    const base = createRouter(routes, { defaultRoute: "home" });
    const loaders: RscLoaderFactoryMap = {
      "users.profile": () => (params) =>
        Promise.resolve(node("Profile", { id: params.id })),
    };

    const results = await Promise.all(
      Array.from({ length: 500 }, async (_, i) => {
        const clone = cloneRouter(base);

        clone.usePlugin(rscServerPluginFactory(loaders));
        const state = await clone.start(`/users/${i}`);
        const rsc = state.context.rsc;

        clone.dispose();

        return rsc;
      }),
    );

    for (let i = 0; i < 500; i++) {
      expect(results[i]).toStrictEqual(node("Profile", { id: String(i) }));
    }
  });

  it("100 starts with failing loader: each rejects with loader error", async () => {
    const base = createRouter(routes, { defaultRoute: "home" });
    const loaders: RscLoaderFactoryMap = {
      home: () => () => Promise.reject(new Error("rsc render failed")),
    };

    let errorCount = 0;

    for (let i = 0; i < 100; i++) {
      const clone = cloneRouter(base);

      clone.usePlugin(rscServerPluginFactory(loaders));

      await expect(clone.start("/")).rejects.toThrow("rsc render failed");

      errorCount++;

      clone.dispose();
    }

    expect(errorCount).toBe(100);
  });

  it("100 concurrent starts with mixed success/failure: each resolves correctly", async () => {
    const base = createRouter(routes, { defaultRoute: "home" });
    const loaders: RscLoaderFactoryMap = {
      "users.profile": () => (params) => {
        const id = Number(params.id);

        if (id % 3 === 0) {
          return Promise.reject(new Error(`rsc fail for ${id}`));
        }

        return Promise.resolve(node("Profile", { id: params.id }));
      },
    };

    const results = await Promise.allSettled(
      Array.from({ length: 100 }, async (_, i) => {
        const clone = cloneRouter(base);

        clone.usePlugin(rscServerPluginFactory(loaders));
        const state = await clone.start(`/users/${i}`);
        const rsc = state.context.rsc;

        clone.dispose();

        return rsc;
      }),
    );

    const rejected = results.filter((r) => r.status === "rejected");
    const fulfilled = results.filter((r) => r.status === "fulfilled");

    expect(rejected).toHaveLength(34); // 0,3,6,...,99
    expect(fulfilled).toHaveLength(66);
  });

  it("50 starts with slow loaders: all resolve within timeout", async () => {
    const base = createRouter(routes, { defaultRoute: "home" });
    const loaders: RscLoaderFactoryMap = {
      home: () => () =>
        new Promise<ReactNode>((resolve) => {
          setTimeout(() => {
            resolve(node("Home", { slow: true }));
          }, 10);
        }),
    };

    const results = await Promise.all(
      Array.from({ length: 50 }, async () => {
        const clone = cloneRouter(base);

        clone.usePlugin(rscServerPluginFactory(loaders));
        const state = await clone.start("/");
        const rsc = state.context.rsc;

        clone.dispose();

        return rsc;
      }),
    );

    for (const rsc of results) {
      expect(rsc).toStrictEqual(node("Home", { slow: true }));
    }
  });

  it("100 iterations with throwing factory: claim released each time", async () => {
    const base = createRouter(routes, { defaultRoute: "home" });

    for (let i = 0; i < 100; i++) {
      const clone = cloneRouter(base);

      const badFactory = rscServerPluginFactory({
        home: () => {
          throw new Error(`factory crash ${i}`);
        },
      });

      expect(() => clone.usePlugin(badFactory)).toThrow(`factory crash ${i}`);

      // Verify claim was released by registering a good plugin
      const goodFactory = rscServerPluginFactory({
        home: () => () => Promise.resolve(node("Home")),
      });

      clone.usePlugin(goodFactory);
      const state = await clone.start("/");

      expect(state.context.rsc).toStrictEqual(node("Home"));

      clone.dispose();
    }
  });

  it("200 concurrent starts across 4 different routes: each gets correct rsc", async () => {
    const base = createRouter(routes, { defaultRoute: "home" });
    const loaders: RscLoaderFactoryMap = {
      home: () => () => Promise.resolve(node("Home")),
      "users.profile": () => (params) =>
        Promise.resolve(node("Profile", { userId: params.id })),
      about: () => () => Promise.resolve(node("About")),
      settings: () => () => Promise.resolve(node("Settings")),
    };

    const paths = ["/", "/users/42", "/about", "/settings"];
    const expected = [
      node("Home"),
      node("Profile", { userId: "42" }),
      node("About"),
      node("Settings"),
    ];

    const results = await Promise.all(
      Array.from({ length: 200 }, async (_, i) => {
        const pathIndex = i % paths.length;
        const clone = cloneRouter(base);

        clone.usePlugin(rscServerPluginFactory(loaders));
        const state = await clone.start(paths[pathIndex]);
        const rsc = state.context.rsc;

        clone.dispose();

        return { rsc, pathIndex };
      }),
    );

    for (const { rsc, pathIndex } of results) {
      expect(rsc).toStrictEqual(expected[pathIndex]);
    }
  });

  it("100 usePlugin/unsubscribe cycles: unsubscribe completes without error", async () => {
    const router: Router = createRouter(routes, { defaultRoute: "home" });
    const loaders: RscLoaderFactoryMap = {
      home: () => () => Promise.resolve(node("Home")),
    };

    for (let i = 0; i < 100; i++) {
      const unsub = router.usePlugin(rscServerPluginFactory(loaders));

      const state = await router.start("/");

      expect(state.context.rsc).toStrictEqual(node("Home"));

      router.stop();
      unsub();
    }
  });

  it("100 iterations of navigate-during-teardown: subscribeLeave race does not crash", async () => {
    // Race contract: invalidate(...) marks the namespace stale, the next
    // navigate triggers the leave handler which awaits the loader, and
    // unsubscribe() removes the listener. If teardown lands while the
    // handler is mid-await, the post-await `claim.write` could land on
    // a released claim. The handler must either complete cleanly or fail
    // in a way the navigate() promise can settle — never crash the loop.
    const base = createRouter(routes, { defaultRoute: "home" });
    let crashes = 0;
    let hangs = 0;
    let releaseSlowLoader: (() => void) | undefined;

    // Per-iteration hard cap (1s) — a navPromise that never settles
    // would otherwise hang until the file-level 60s testTimeout and
    // surface as a generic "test timed out" instead of pointing at the
    // iteration that wedged. Counting hangs makes the failure mode
    // explicit instead of relying on the harness wall clock.
    const ITERATION_TIMEOUT_MS = 1000;

    for (let i = 0; i < 100; i++) {
      const clone = cloneRouter(base);
      const slowPromise = new Promise<ReactNode>((resolve) => {
        releaseSlowLoader = (): void => {
          resolve(node("Slow", { i }));
        };
      });

      const unsub = clone.usePlugin(
        rscServerPluginFactory({
          home: () => () => Promise.resolve(node("Home", { i })),
          "users.profile": () => () => slowPromise,
        }),
      );

      try {
        await clone.start("/"); // home — primes the leave-handler path

        invalidate(clone, "rsc");
        const navPromise = clone.navigate("users.profile", { id: String(i) });

        // Yield enough microtasks to land inside `await loader(…)` of the
        // leave handler. Mirrors YIELDS_TO_REACH_LOADER_AWAIT in
        // rsc-loader.test.ts:1160-1172 — same priming sequence for the
        // leave handler's `await loader(params, { signal })` boundary.
        const YIELDS_TO_REACH_LOADER_AWAIT = 3;

        for (let y = 0; y < YIELDS_TO_REACH_LOADER_AWAIT; y++) {
          await Promise.resolve();
        }

        // Tear down WHILE the handler is awaiting the loader. The handler
        // continues to completion; its post-await `claim.write` may throw
        // if core enforces release strictly, in which case navPromise
        // rejects — that's allowed, just not a process crash.
        unsub();
        releaseSlowLoader?.();

        const HANG_SENTINEL = Symbol("hang");
        const timeoutPromise = new Promise<typeof HANG_SENTINEL>((resolve) => {
          setTimeout(() => {
            resolve(HANG_SENTINEL);
          }, ITERATION_TIMEOUT_MS);
        });
        const settled = await Promise.race([
          Promise.allSettled([navPromise]).then(() => "settled" as const),
          timeoutPromise,
        ]);

        if (settled === HANG_SENTINEL) {
          hangs++;
        }
      } catch {
        crashes++;
      } finally {
        clone.dispose();
      }
    }

    expect(crashes).toBe(0);
    // Hangs would silently inflate wall time under the 60s testTimeout —
    // count them as a distinct failure mode so a regression that wedges
    // navPromise (e.g. unrelinquished leave-handler lock) surfaces with
    // its own assertion rather than the harness's generic timeout error.
    expect(hangs).toBe(0);
  });

  it("1000 cycles with WeakRef on rsc payload: no leak past GC", async () => {
    // RSC payloads carry closures, so leaks can be more memorable than for
    // plain JSON. Mirrors ssr-data-plugin's data-loader-stress.stress.ts:144
    // with a ReactNode-shaped payload.
    const base = createRouter(routes, { defaultRoute: "home" });
    const refs: WeakRef<object>[] = [];

    for (let i = 0; i < 1000; i++) {
      const clone = cloneRouter(base);

      clone.usePlugin(
        rscServerPluginFactory({
          "users.profile": () => (params) =>
            // Build a fresh payload object each call so WeakRef can observe
            // collection — a constant payload would be retained module-side.
            Promise.resolve(node("Profile", { id: params.id, capture: i })),
        }),
      );

      const state = await clone.start(`/users/${i}`);
      const rsc = state.context.rsc as object | undefined;

      if (rsc !== undefined) {
        refs.push(new WeakRef(rsc));
      }

      clone.dispose();
    }

    // Two-pass GC + breathing room — V8 is non-deterministic, so we tolerate
    // a small residue. Threshold mirrors ssr-data-plugin's 200/1000.
    globalThis.gc?.();

    await new Promise((r) => {
      setTimeout(r, 50);
    });
    globalThis.gc?.();

    const alive = refs.filter((r) => r.deref() !== undefined).length;

    expect(alive).toBeLessThan(200);
  });

  it("stop() during slow loader: no crash, every start() promise settles (no hung promise)", async () => {
    const base = createRouter(routes, { defaultRoute: "home" });
    let survived = 0;
    // Include "pending" in the element type so the deadline branch widens the
    // array — that keeps `.not.toContain("pending")` a real check rather than
    // a comparison eslint flags as always-false.
    const statuses: (PromiseSettledResult<unknown>["status"] | "pending")[] =
      [];

    for (let i = 0; i < 50; i++) {
      const clone = cloneRouter(base);
      const loaders: RscLoaderFactoryMap = {
        home: () => () =>
          new Promise<ReactNode>((resolve) => {
            setTimeout(() => {
              resolve(node("Home", { slow: true }));
            }, 10);
          }),
      };

      clone.usePlugin(rscServerPluginFactory(loaders));
      const promise = clone.start("/");

      // stop while loader is pending
      clone.stop();

      // Race the start() promise against a deadline. allSettled alone can't
      // distinguish "settled" from "still pending" — if stop() left the
      // start() promise hung (loader never resolved, never rejected), this
      // await would block until the file's 60s testTimeout and surface as a
      // generic timeout. The deadline turns a hung promise into an explicit
      // "pending" status we can assert against.
      const PENDING = "pending" as const;
      const HANG_MS = 1000;
      const outcome = await Promise.race([
        Promise.allSettled([promise]).then(([r]) => r.status),
        new Promise<typeof PENDING>((resolve) => {
          setTimeout(() => {
            resolve(PENDING);
          }, HANG_MS);
        }),
      ]);

      statuses.push(outcome);

      clone.dispose();
      survived += 1;
    }

    expect(survived).toBe(50);

    // The strengthened invariant: stop() during a pending loader must drive
    // every start() promise to a terminal state (fulfilled or rejected) —
    // never leave it pending. A regression that dropped the in-flight
    // transition without settling its promise would show up here as a
    // "pending" entry, instead of silently inflating wall-clock time.
    expect(statuses).toHaveLength(50);
    expect(statuses).not.toContain("pending");
  });

  it("100 concurrent navigate() racing with invalidate(): no crash, loader sees fresh signal", async () => {
    // Concurrent CSR revalidation under a single router: every iteration
    // marks the namespace stale, fires N parallel `navigate()`, and waits
    // for them all to settle. Core's transition pipeline serialises
    // concurrent navigations (newer aborts older); the rsc-server-plugin
    // leave handler races against those aborts. The contract under
    // stress is "the FSM still terminates, and the surviving navigation
    // either resolves with a fresh ReactNode or rejects deterministically
    // — never crashes the loop or leaves the router stuck."
    const router = createRouter(routes, { defaultRoute: "home" });
    const loaderCalls: number[] = [];
    let loaderSeq = 0;

    router.usePlugin(
      rscServerPluginFactory({
        "users.profile": () => async (params, ctx) => {
          const seq = ++loaderSeq;

          // Microtask-yielded loader so a newer navigate() can cancel
          // us mid-flight via the ctx.signal. Robust loaders check
          // upfront — we mirror that to spot the cancellation early.
          await Promise.resolve();

          if (ctx?.signal.aborted) {
            throw new Error(`aborted-${seq}`);
          }

          loaderCalls.push(seq);

          return node("Profile", { id: params.id, seq });
        },
      }),
    );

    await router.start("/users/0");

    expect(loaderCalls).toStrictEqual([1]); // start interceptor

    let crashes = 0;

    for (let i = 0; i < 100; i++) {
      invalidate(router, "rsc");

      const fleet = Array.from({ length: 4 }, (_, k) =>
        router
          .navigate("users.profile", { id: `i${i}-${k}` }, undefined, {
            reload: true,
          })
          // Concurrent navigations cancel each other; rejection is
          // expected, crash is not.
          .catch(() => undefined),
      );

      try {
        await Promise.allSettled(fleet);
      } catch {
        crashes++;
      }
    }

    expect(crashes).toBe(0);

    // The leave handler clears the stale flag only after a successful
    // non-cancelled write. With 100 invalidate() + 4 racing navigations
    // each, exactly one navigation per outer iteration survives the
    // signal.aborted check and reaches `loaderCalls.push` — the other
    // three are aborted by the next navigate() before their post-yield
    // check. Measured: exactly 101 (100 winners + the start interceptor),
    // stable across 16 trials. Lower bound is therefore the exact
    // expected value (one winner per iteration is mandatory — fewer means
    // the stale flag was lost). The upper bound is tightened from the old
    // loose `1 + 100*4 = 401` (which admitted EVERY racing nav pushing, a
    // broken-cancellation state) to a tight 101 + a small slip-through
    // margin: a scheduler that lets an older nav push before the newer one
    // aborts it could add a few, but a regression that stopped cancelling
    // would blow well past this.
    const SLIP_THROUGH_MARGIN = 12;

    expect(loaderCalls.length).toBeGreaterThanOrEqual(100 + 1);
    expect(loaderCalls.length).toBeLessThanOrEqual(101 + SLIP_THROUGH_MARGIN);

    // Strong, fully-deterministic final-state invariant: last-write-wins is
    // strict under the FSM, so the surviving navigation is the LAST one
    // started — i=99, k=3 → id "i99-3". The committed rsc payload must match
    // that winning navigation's params. A stale-write bug (an older loader's
    // ReactNode clobbering the winner) would surface here as a mismatched id.
    const finalState = router.getState();

    expect(finalState?.name).toBe("users.profile");
    expect(finalState?.params.id).toBe("i99-3");
    expect(
      (finalState?.context.rsc as { props?: { id?: string } } | undefined)
        ?.props?.id,
    ).toBe("i99-3");

    router.stop();
  });

  it("100 cycles of invalidate-after-dispose: WeakMap entry GC'd with router (§7.G1)", async () => {
    // §7.G1: invalidate(router, "rsc") writes to the per-router WeakMap.
    // If invalidate is called AFTER unsub() and dispose(), the entry
    // briefly lives in the registry — the WeakMap key (router itself)
    // becomes the only retention path. Once the test's local reference
    // drops, the entry must be GC-eligible. Verify: (a) no crash on
    // invalidate after dispose, (b) no leak — collected entries don't
    // grow unboundedly.
    const base = createRouter(routes, { defaultRoute: "home" });
    const refs: WeakRef<Router>[] = [];

    for (let i = 0; i < 100; i++) {
      const clone = cloneRouter(base);
      const unsub = clone.usePlugin(
        rscServerPluginFactory({
          home: () => () => Promise.resolve(node("Home", { i })),
        }),
      );

      await clone.start("/");
      unsub();

      // The flag is set on the WeakMap AFTER unsub — listener gone, flag
      // still lands. The function must not crash.
      expect(() => {
        invalidate(clone, "rsc");
      }).not.toThrow();

      clone.dispose();

      // Second invalidate post-dispose — must also not crash. WeakMap
      // entry survives dispose (only GC clears it).
      expect(() => {
        invalidate(clone, "rsc");
      }).not.toThrow();

      refs.push(new WeakRef(clone));
    }

    // GC pass — any clones not retained outside `refs` should collect.
    globalThis.gc?.();
    await new Promise((r) => {
      setTimeout(r, 50);
    });
    globalThis.gc?.();

    const alive = refs.filter((r) => r.deref() !== undefined).length;

    // Conservative threshold mirrors the WeakRef pattern elsewhere in
    // this file (1000-cycle test uses <200). Sub-50 leaves margin for
    // V8 nondeterminism while still flagging an unbounded leak.
    expect(alive).toBeLessThan(50);
  });

  it("100 hot-swap cycles with pre-existing stale flag: new plugin consumes mark (§7.G2)", async () => {
    // §7.G2: rapid unsub → invalidate → re-usePlugin → navigate, all on
    // the SAME router instance. The stale flag survives teardown
    // (documented in §3.7 as intentional). Each iteration must:
    //   (a) successfully register a new plugin (claim namespace),
    //   (b) consume the pre-existing flag via the FIRST nav after
    //       re-register (loader runs once),
    //   (c) clear the flag after that consume (second nav doesn't
    //       re-trigger loader).
    const router = createRouter(routes, { defaultRoute: "home" });
    let totalConsumes = 0;

    for (let i = 0; i < 100; i++) {
      const loader = vi.fn().mockResolvedValue(node("Home", { i }));
      const unsub = router.usePlugin(
        rscServerPluginFactory({
          home: () => loader,
          "users.profile": () => loader,
        }),
      );

      if (i === 0) {
        await router.start("/");
      } else {
        // After the first iteration the router stays started across the
        // hot-swap — re-usePlugin attaches new listeners on the running
        // router. Reset call count so the per-iteration assertion
        // measures only THIS iteration's consume.
        loader.mockClear();
      }

      // Set the flag while a plugin is active. Then tear down — the
      // flag survives in the WeakMap.
      invalidate(router, "rsc");
      unsub();

      // Re-register. The new subscribeLeave listener observes the
      // pre-existing flag on its first leave-approve cycle.
      const unsub2 = router.usePlugin(
        rscServerPluginFactory({
          home: () => loader,
          "users.profile": () => loader,
        }),
      );

      // Navigate to consume the flag.
      await router.navigate("users.profile", { id: String(i) });

      // The replacement listener saw the flag and ran the loader.
      expect(loader).toHaveBeenCalled();

      totalConsumes += loader.mock.calls.length;

      unsub2();
    }

    // Each iteration consumed at least one loader call. 100 cycles ⇒
    // ≥100 consumes overall. Loose lower bound — V8 timing variance
    // could collapse some calls in concurrent scenarios; this is
    // sequential, so the bound is tight.
    expect(totalConsumes).toBeGreaterThanOrEqual(100);
  });

  it("50 cycles in-flight invalidate + guard rejection (§7.G3)", async () => {
    // §7.G3: invalidate during nav that rejects on ACTIVATION GUARD.
    //
    // Subtle invariant (different from loader-rejection AND abort):
    // the leave handler runs in LEAVE_APPROVE phase — BEFORE activation
    // guards. It awaits the loader, then `clearStale` runs ONLY IF
    // `!signal.aborted`. Activation guards that reject do NOT abort
    // the signal — they reject the navigation by returning false.
    // So the leave handler completes its loader+clearStale path, even
    // though the navigation as a whole rejects.
    //
    // CONSEQUENCE: guard-rejection IS "the navigation that consumes
    // the flag" — different from loader-rejection (loader threw, no
    // clearStale) and abort (signal.aborted=true, no clearStale).
    // Pin this asymmetry so a future refactor that moved clearStale
    // to TRANSITION_SUCCESS would surface here as deliberate breaking.
    const base = createRouter(routes, { defaultRoute: "home" });
    const router = cloneRouter(base);
    const loader = vi.fn().mockResolvedValue(node("Profile"));
    let allowGuard = true;

    router.usePlugin(rscServerPluginFactory({ "users.profile": () => loader }));

    const lifecycleApi = getLifecycleApi(router);

    lifecycleApi.addActivateGuard("users.profile", () => () => allowGuard);

    await router.start("/");

    let rejections = 0;
    let loaderRanDuringRejection = 0;
    let loaderRanOnFollowUp = 0;

    for (let i = 0; i < 50; i++) {
      // 1) Mark stale, then block the guard so the navigation fails.
      invalidate(router, "rsc");
      allowGuard = false;
      loader.mockClear();

      await router.navigate("users.profile", { id: `g${i}` }).catch(() => {
        rejections++;
      });

      // The leave handler ran (LEAVE_APPROVE is before activation guards),
      // loader was invoked, clearStale ran (no abort). The activation
      // guard then rejected the navigation, but the flag is already gone.
      if (loader.mock.calls.length > 0) {
        loaderRanDuringRejection++;
      }

      // 2) Open the guard. The flag is GONE — follow-up nav must NOT
      // see it (no fresh invalidate).
      allowGuard = true;
      loader.mockClear();
      await router.navigate("users.profile", { id: `ok${i}` });

      if (loader.mock.calls.length > 0) {
        loaderRanOnFollowUp++;
      }
    }

    expect(rejections).toBe(50);
    // Guard-rejection invariant: leave handler consumed the flag every
    // cycle — loader ran during the rejected navigation.
    expect(loaderRanDuringRejection).toBe(50);
    // Follow-up navigation without fresh invalidate must NOT trigger
    // the loader — flag was consumed by the rejected nav's leave handler.
    expect(loaderRanOnFollowUp).toBe(0);

    router.stop();
  });

  it("200 sequential start() with param mutation: each gets correct rsc (§7.G5)", async () => {
    // §7.G5: sequential `start()` calls on the same router with
    // different paths. Router is single-threaded per state, so this is
    // strict-serial — but a regression that cached `state.params` in
    // the loader closure (instead of reading per-call from the
    // resolved state) would surface as cross-call leakage.
    const router = createRouter(routes, { defaultRoute: "home" });

    router.usePlugin(
      rscServerPluginFactory({
        "users.profile": () => (params) =>
          Promise.resolve(node("Profile", { id: params.id })),
      }),
    );

    for (let i = 0; i < 200; i++) {
      router.stop();

      const state = await router.start(`/users/${i}`);

      expect(state.context.rsc).toStrictEqual(
        node("Profile", { id: String(i) }),
      );
    }

    router.stop();
  });

  it("100 cycles abort-before-loader-await + invalidate (§7.G6)", async () => {
    // §7.G6: a navigation aborted BEFORE its leave-handler reaches
    // `await loader(...)`. The stale flag is consumed only after a
    // successful, non-cancelled write — an abort BEFORE the loader
    // starts must leave the flag intact for the next navigation.
    const base = createRouter(routes, { defaultRoute: "home" });
    const router = cloneRouter(base);
    const loader = vi.fn().mockResolvedValue(node("Profile"));

    router.usePlugin(rscServerPluginFactory({ "users.profile": () => loader }));

    await router.start("/");

    let abortedConsumes = 0;

    for (let i = 0; i < 100; i++) {
      invalidate(router, "rsc");
      loader.mockClear();

      const ac = new AbortController();
      const navPromise = router.navigate(
        "users.profile",
        { id: `a${i}` },
        undefined,
        { signal: ac.signal },
      );

      // Abort IMMEDIATELY — synchronously, before any microtask had a
      // chance to schedule the leave handler.
      ac.abort();

      await navPromise.catch(() => undefined);

      // Flag preserved — a follow-up nav with no abort consumes it.
      await router.navigate("users.profile", { id: `r${i}` });

      if (loader.mock.calls.length > 0) {
        abortedConsumes++;
      }
    }

    // Every aborted-then-recovered iteration must consume the flag on
    // the follow-up nav. If abort somehow cleared the flag, the
    // follow-up would not see it and the counter would drop.
    expect(abortedConsumes).toBe(100);

    router.stop();
  });
});
