import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { createRouter, errorCodes } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

import type { Router } from "@real-router/core";

/**
 * #1611 — a router torn down from inside `completeTransition` must not still get
 * the commit.
 *
 * `completeTransition` runs exactly one piece of USER code before `setState`:
 * the post-leave cleanup calls `clearCanDeactivate(name, "external")`, which —
 * when a **definition** factory survives the clear — recompiles the slot by
 * invoking that factory (`#clearGuard` → `#recompileSlot` → `compileFactory`).
 * A factory that calls `dispose()` / `stop()` violates its contract, but the
 * failure mode was silent state corruption: `setState` proceeded, `navigate()`
 * resolved with success, and `COMPLETE` from `DISPOSED`/`IDLE` is a table no-op
 * so no `TRANSITION_SUCCESS` ever reached subscribers.
 *
 * The #1169 commit-gate could not see it: it sits BEFORE `completeTransition`,
 * i.e. on the other side of that user code, and is `suspendable`-gated while
 * this reproduces on the uncancellable `completeImmediate` arc (#1588) — which
 * `forceDeactivate: true` selects by zeroing `shouldDeactivate`.
 */

const RealAbortController = AbortController;

let created: number;

class CountingAbortController extends RealAbortController {
  constructor() {
    super();
    created++;
  }
}

interface Fixture {
  router: Router;
  log: string[];
  arm: () => void;
}

/**
 * A route carrying BOTH a definition and an external `canDeactivate` — the
 * clear then has a survivor to recompile, which is what runs the factory.
 */
function createFixture(teardown: (router: Router) => void): Fixture {
  const log: string[] = [];
  let armed = false;
  let router!: Router;

  router = createRouter([
    {
      name: "home",
      path: "/",
      canDeactivate: () => {
        if (armed) {
          teardown(router);
        }

        return () => true;
      },
    },
    { name: "a", path: "/a" },
  ]);

  router.usePlugin(() => ({
    onTransitionStart: (to) => log.push(`START:${to.name}`),
    onTransitionSuccess: (to) => log.push(`SUCCESS:${to.name}`),
  }));

  getLifecycleApi(router).addDeactivateGuard("home", () => () => true);

  return {
    router,
    log,
    arm: () => {
      armed = true;
    },
  };
}

const codeOf = (error: unknown): string | undefined =>
  (error as { code?: string }).code;

describe("#1611 — a guard factory that tears the router down mid-commit", () => {
  beforeEach(() => {
    created = 0;
    vi.stubGlobal("AbortController", CountingAbortController);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects the navigation when the recompiled factory calls dispose()", async () => {
    const { router, log, arm } = createFixture((r) => {
      r.dispose();
    });

    await router.start("/");
    arm();

    const outcome = await router
      .navigate("a", {}, undefined, { forceDeactivate: true })
      .then(
        (state) => `resolved:${state.name}`,
        (error: unknown) => `rejected:${codeOf(error)}`,
      );

    expect(outcome).toBe(`rejected:${errorCodes.TRANSITION_CANCELLED}`);
    // The committed state must not be the one the dead router refused.
    expect(router.getState()?.name).not.toBe("a");
    expect(log).not.toContain("SUCCESS:a");
  });

  it("rejects the navigation when the recompiled factory calls stop()", async () => {
    const { router, log, arm } = createFixture((r) => {
      r.stop();
    });

    await router.start("/");
    arm();

    const outcome = await router
      .navigate("a", {}, undefined, { forceDeactivate: true })
      .then(
        (state) => `resolved:${state.name}`,
        (error: unknown) => `rejected:${codeOf(error)}`,
      );

    expect(outcome).toBe(`rejected:${errorCodes.TRANSITION_CANCELLED}`);
    expect(router.getState()?.name).not.toBe("a");
    expect(log).not.toContain("SUCCESS:a");
  });

  it("does not leave a state committed on a disposed router", async () => {
    const { router, arm } = createFixture((r) => {
      r.dispose();
    });

    await router.start("/");
    arm();

    await expect(
      router.navigate("a", {}, undefined, { forceDeactivate: true }),
    ).rejects.toBeDefined();

    expect(getInternals(router).isDisposed()).toBe(true);
    expect(router.getState()?.name).not.toBe("a");
  });

  it("keeps the arc uncancellable — the fix allocates no AbortController", async () => {
    const { router, arm } = createFixture((r) => {
      r.dispose();
    });

    await router.start("/");
    arm();
    created = 0;

    await expect(
      router.navigate("a", {}, undefined, { forceDeactivate: true }),
    ).rejects.toBeDefined();

    // разрез А (#1588): no controller, no liveness closure, no commit-gate.
    // The fix must not buy safety by re-arming the machinery this arc drops.
    expect(created).toBe(0);
  });

  it("does not overwrite the result of a navigation the factory itself started", async () => {
    // Not a teardown, the same window: the factory starts a nested navigation
    // that runs to completion, which cancels this one and leaves the FSM in
    // READY. Committing anyway would silently overwrite the nested result —
    // caught by asking `isTransitioning()` rather than `isActive()`.
    const log: string[] = [];
    let armed = false;
    let router!: Router;

    router = createRouter([
      {
        name: "home",
        path: "/",
        canDeactivate: () => {
          if (armed) {
            armed = false;
            router.navigate("b").catch(() => {
              /* fire-and-forget */
            });
          }

          return () => true;
        },
      },
      { name: "a", path: "/a" },
      { name: "b", path: "/b" },
    ]);

    router.usePlugin(() => ({
      onTransitionSuccess: (to) => log.push(`SUCCESS:${to.name}`),
    }));

    getLifecycleApi(router).addDeactivateGuard("home", () => () => true);

    await router.start("/");
    armed = true;
    log.length = 0;

    const outcome = await router
      .navigate("a", {}, undefined, { forceDeactivate: true })
      .then(
        (state) => `resolved:${state.name}`,
        (error: unknown) => `rejected:${codeOf(error)}`,
      );

    expect(outcome).toBe(`rejected:${errorCodes.TRANSITION_CANCELLED}`);
    // The nested navigation's result stands; `a` never lands on top of it.
    expect(router.getState()?.name).toBe("b");
    expect(log).toStrictEqual(["SUCCESS:b"]);
  });

  it("still commits normally when the recompiled factory behaves", async () => {
    const { router, log, arm } = createFixture(() => {
      /* well-behaved factory — side-effect-free with respect to the router */
    });

    await router.start("/");
    arm();

    const state = await router.navigate("a", {}, undefined, {
      forceDeactivate: true,
    });

    expect(state.name).toBe("a");
    expect(router.getState()?.name).toBe("a");
    expect(log).toContain("SUCCESS:a");
  });
});
