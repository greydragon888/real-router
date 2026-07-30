import { createRouter } from "@real-router/core";
import { cloneRouter } from "@real-router/core/api";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { invalidate, ssrDataPluginFactory } from "../../src";

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
];

describe("invalidate() race conditions", () => {
  beforeAll(() => {
    vi.spyOn(console, "warn").mockImplementation(noop);
    vi.spyOn(console, "error").mockImplementation(noop);
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it("100 iterations of navigate-during-teardown: subscribeLeave race does not crash", async () => {
    // Race contract: invalidate(...) marks the namespace stale, the next
    // navigate triggers the leave handler which awaits the loader, and
    // unsubscribe() removes the listener. If teardown lands while the
    // handler is mid-await, the post-await `claim.write` could land on
    // a released claim. The handler must either complete cleanly or fail
    // in a way the navigate() promise can settle — never crash the loop.
    //
    // Symmetric to rsc-server-plugin/tests/stress/rsc-stress.stress.ts.
    const base = createRouter(routes, { defaultRoute: "home" });
    let crashes = 0;
    let releaseSlowLoader: (() => void) | undefined;

    for (let i = 0; i < 100; i++) {
      const clone = cloneRouter(base);
      const slowPromise = new Promise<{ v: number }>((resolve) => {
        releaseSlowLoader = (): void => {
          resolve({ v: i });
        };
      });

      const unsub = clone.usePlugin(
        ssrDataPluginFactory({
          home: () => () => Promise.resolve({ page: "home" }),
          "users.profile": () => () => slowPromise,
        }),
      );

      try {
        await clone.start("/"); // home — primes the leave-handler path

        invalidate(clone, "data");
        const navPromise = clone.navigate("users.profile", {
          id: String(i),
        });

        // Yield enough microtasks to land inside `await loader(…)` of the
        // leave handler.
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();

        // Tear down WHILE the handler is awaiting the loader. The handler
        // continues to completion; its post-await `claim.write` may throw
        // if core enforces release strictly, in which case navPromise
        // rejects — that's allowed, just not a process crash.
        unsub();
        releaseSlowLoader?.();

        await Promise.allSettled([navPromise]);
      } catch {
        crashes++;
      } finally {
        clone.dispose();
      }
    }

    expect(crashes).toBe(0);
  });

  it("200 concurrent navigations after invalidate(): flag survives cancellations until one write succeeds", async () => {
    // Concurrency contract documented in data-loader.test.ts §"preserves
    // the flag when navigation is cancelled mid-loader": when the FSM
    // cancels an in-flight navigation, the leave handler's post-await
    // `signal.aborted` check skips the write AND preserves the flag.
    // Under N concurrent navigations on the same router, the loader can
    // be invoked anywhere from 1 to N times (each cancel preserves the
    // flag for the next nav to consume), but exactly one write succeeds
    // — the one whose loader completes without cancellation.
    //
    // What we can assert without flake under FSM cancellation:
    //   - At least one navigation succeeds.
    //   - At least one loader call happened (flag was consumed, not
    //     silently dropped).
    //   - At most N loader calls happened (no infinite loop / leak).
    //   - The successful navigation's state.context.data reflects the
    //     loader's last successful return value.
    const router = createRouter(routes, { defaultRoute: "home" });
    let loaderCalls = 0;
    const loader = vi.fn().mockImplementation(() => {
      loaderCalls += 1;

      return Promise.resolve({ v: loaderCalls });
    });

    router.usePlugin(ssrDataPluginFactory({ "users.profile": () => loader }));

    await router.start("/users/42"); // primes — flag-clear baseline
    loader.mockClear();
    loaderCalls = 0;

    invalidate(router, "data");

    const results = await Promise.allSettled(
      Array.from({ length: 200 }, () =>
        router.navigate("users.profile", { id: "42" }, undefined, {
          reload: true,
        }),
      ),
    );

    const fulfilled = results.filter((r) => r.status === "fulfilled").length;

    // Exactly ONE navigation wins. Core's transition pipeline serialises
    // concurrent navigations to the same route (newer aborts older), so of
    // 200 racing navigate({ reload: true }) calls precisely one reaches
    // TRANSITION_SUCCESS — the rest reject as cancelled. This is the core
    // serialisation contract and is deterministic regardless of how many
    // loaders ran; `> 0` admitted the broken state where several writes
    // landed (a serialisation bug). Pin it to 1.
    expect(fulfilled).toBe(1);

    // Loader-call count: each cancelled nav preserves the stale flag for
    // the next, so in practice all 200 leave handlers invoke the loader
    // (measured 200/200 across 30 trials). But a scheduler that aborts an
    // older nav BEFORE its leave handler peeks the flag could legitimately
    // skip a call, so the documented contract is 1..N. Keep a SAFE lower
    // bound (≥1: the flag was consumed, not silently dropped) and the hard
    // upper bound (≤200: no infinite re-run / leak).
    expect(loaderCalls).toBeGreaterThanOrEqual(1);
    expect(loaderCalls).toBeLessThanOrEqual(200);

    // Strong final-state invariant: the winning navigation's data is the
    // LAST loader return value (the survivor is the newest nav, holding the
    // highest counter). `{ v: loaderCalls }` ties the committed state to the
    // most recent loader call — a stale-write bug (an older loader clobbering
    // the winner) would surface here as v < loaderCalls.
    expect(router.getState()?.context.data).toStrictEqual({ v: loaderCalls });

    router.stop();
  });

  it("100 iterations of repeated invalidate() between two navigations: collapses to single re-run", async () => {
    // N invalidate() calls between navigations must collapse to a single
    // re-run thanks to Set-deduplication in markStale. Stress-grade
    // version of the unit test that does this 3 times.
    const router = createRouter(routes, { defaultRoute: "home" });
    let loaderCalls = 0;
    const loader = vi.fn().mockImplementation(() => {
      loaderCalls += 1;

      return Promise.resolve({ v: loaderCalls });
    });

    router.usePlugin(ssrDataPluginFactory({ "users.profile": () => loader }));

    await router.start("/users/42");
    loader.mockClear();
    loaderCalls = 0;

    for (let i = 0; i < 100; i++) {
      invalidate(router, "data");
    }

    await router.navigate("users.profile", { id: "42" }, undefined, {
      reload: true,
    });

    expect(loaderCalls).toBe(1);

    router.stop();
  });
});
