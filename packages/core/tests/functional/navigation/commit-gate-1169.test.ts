import { describe, it, expect, vi } from "vitest";

import { createRouter, errorCodes, events } from "@real-router/core";
import { getLifecycleApi, getPluginApi } from "@real-router/core/api";

import { createTestRouter } from "../../helpers";

const codeOf = (error: unknown): string | undefined =>
  (error as { code?: string }).code;

/**
 * #1169 navigation commit-gate + #1197 + #1186 — regression set.
 *
 * A synchronous `stop()`/`dispose()`/external-`opts.signal` abort from inside a
 * transition listener (`subscribeLeave`, plugin `onTransitionStart`) must cancel
 * the in-flight navigation, not commit it. The FSM table (D-full: `send()` not
 * `forceState`) prevents the resurrection; the pre-commit gate prevents the
 * `setState`. Mirrors `benchmarks/audit-probes/navigate-2026-07-03/probe-02`.
 */
describe("commit-gate #1169 — stop/dispose/abort from a transition listener", () => {
  it("QA: stop() from a sync subscribeLeave cancels (no commit, router stopped)", async () => {
    const router = createTestRouter();

    await router.start("/home");

    router.subscribeLeave(() => {
      router.stop();
    });

    const outcome = await router.navigate("items", { id: "1" }).then(
      (s) => ({ code: undefined, name: s.name }),
      (error: unknown) => ({ code: codeOf(error), name: undefined }),
    );

    expect(outcome.code).toBe(errorCodes.TRANSITION_CANCELLED);
    expect(router.isActive()).toBe(false);
  });

  it("QB: dispose() from a sync subscribeLeave cancels (no commit)", async () => {
    const router = createTestRouter();

    await router.start("/home");

    router.subscribeLeave(() => {
      router.dispose();
    });

    const code = await router.navigate("items", { id: "1" }).then(
      () => undefined,
      (error: unknown) => codeOf(error),
    );

    expect(code).toBe(errorCodes.TRANSITION_CANCELLED);
    expect(router.isActive()).toBe(false);
  });

  it("QD: external opts.signal abort from a sync subscribeLeave cancels", async () => {
    const router = createTestRouter();

    await router.start("/home");

    const controller = new AbortController();

    router.subscribeLeave(() => {
      controller.abort();
    });

    const code = await router
      .navigate("items", { id: "1" }, undefined, { signal: controller.signal })
      .then(
        () => undefined,
        (error: unknown) => codeOf(error),
      );

    expect(code).toBe(errorCodes.TRANSITION_CANCELLED);
    // Router stays live — an external abort cancels the navigation, not the router.
    expect(router.isActive()).toBe(true);
  });

  it("QE: stop() from a plugin onTransitionStart cancels (no resurrection)", async () => {
    const router = createTestRouter();

    await router.start("/home");

    router.usePlugin(() => ({
      onTransitionStart: () => {
        router.stop();
      },
    }));

    const code = await router.navigate("items", { id: "1" }).then(
      () => undefined,
      (error: unknown) => codeOf(error),
    );

    expect(code).toBe(errorCodes.TRANSITION_CANCELLED);
    expect(router.isActive()).toBe(false);
  });

  it("QF: dispose() from a plugin onTransitionStart cancels (no zombie router)", async () => {
    const router = createTestRouter();

    await router.start("/home");

    router.usePlugin(() => ({
      onTransitionStart: () => {
        router.dispose();
      },
    }));

    const code = await router.navigate("items", { id: "1" }).then(
      () => undefined,
      (error: unknown) => codeOf(error),
    );

    expect(code).toBe(errorCodes.TRANSITION_CANCELLED);
    expect(router.isActive()).toBe(false);
  });

  it("QG: stop() from a plugin onTransitionLeaveApprove cancels (pre-commit window)", async () => {
    const router = createTestRouter();

    await router.start("/home");

    // onTransitionLeaveApprove is a pre-commit window too — the suspendable
    // snapshot must cover it (not just onTransitionStart / subscribeLeave),
    // else the cancel misclassifies (NOT_STARTED instead of CANCELLED).
    router.usePlugin(() => ({
      onTransitionLeaveApprove: () => {
        router.stop();
      },
    }));

    const code = await router.navigate("items", { id: "1" }).then(
      () => undefined,
      (error: unknown) => codeOf(error),
    );

    expect(code).toBe(errorCodes.TRANSITION_CANCELLED);
    expect(router.isActive()).toBe(false);
  });

  it("emits no TRANSITION_SUCCESS after TRANSITION_CANCEL (clean event stream)", async () => {
    const router = createTestRouter();

    await router.start("/home");

    const seen: string[] = [];
    const api = getPluginApi(router);

    api.addEventListener(events.TRANSITION_SUCCESS, () => seen.push("SUCCESS"));
    api.addEventListener(events.TRANSITION_CANCEL, () => seen.push("CANCEL"));

    router.subscribeLeave(() => {
      router.stop();
    });

    await router.navigate("items", { id: "1" }).catch(() => {});

    expect(seen).toContain("CANCEL");
    expect(seen).not.toContain("SUCCESS");
  });
});

describe("#1197 — external abort during async subscribeLeave canonicalizes", () => {
  it("rejects RouterError(TRANSITION_CANCELLED), not the raw reason, with no spurious error", async () => {
    const router = createTestRouter();

    await router.start("/home");

    const onError = vi.fn();

    getPluginApi(router).addEventListener(events.TRANSITION_ERROR, onError);

    // Async leave parks the pipeline; the external signal aborts while parked.
    router.subscribeLeave(
      () => new Promise<void>((resolve) => setTimeout(resolve, 50)),
    );

    const controller = new AbortController();
    const nav = router.navigate("items", { id: "1" }, undefined, {
      signal: controller.signal,
    });

    await new Promise((r) => setTimeout(r, 5));
    controller.abort(new Error("user-cancelled"));

    const code = await nav.then(
      () => undefined,
      (error: unknown) => codeOf(error),
    );

    expect(code).toBe(errorCodes.TRANSITION_CANCELLED);
    // No spurious TRANSITION_ERROR after the cancel (guard-path parity).
    expect(onError).not.toHaveBeenCalled();
  });

  it("threads an internal cancel (RouterError) through unchanged (#943 reason preserved)", async () => {
    const router = createTestRouter();

    await router.start("/home");

    // Async leave parks; a second navigate supersedes → internal cancel whose
    // reason is already a RouterError(TRANSITION_CANCELLED) — passed through.
    router.subscribeLeave(
      () => new Promise<void>((resolve) => setTimeout(resolve, 50)),
    );

    const first = router.navigate("items", { id: "1" });

    await new Promise((r) => setTimeout(r, 5));
    const second = router.navigate("index");

    const code = await first.then(
      () => undefined,
      (error: unknown) => codeOf(error),
    );

    expect(code).toBe(errorCodes.TRANSITION_CANCELLED);

    await second;
  });
});

describe("#1186 — navigateToNotFound liveness gate", () => {
  it("dispose() while a start-interceptor is parked rejects start() with no committed state", async () => {
    const router = createTestRouter();

    let release!: () => void;
    const parked = new Promise<void>((resolve) => {
      release = resolve;
    });

    getPluginApi(router).addInterceptor("start", async (next, path) => {
      await parked; // park the start pipeline in the interceptor window

      return next(path);
    });

    const startPromise = router.start("/home");

    await new Promise((r) => setTimeout(r, 5));

    // Dispose lands while the interceptor is parked (FSM already DISPOSED). When
    // the interceptor resumes, matchPath misses the cleared tree and the default
    // allowNotFound path would commit UNKNOWN_ROUTE on the disposed router.
    router.dispose();
    release();

    const outcome = await startPromise.then(
      () => "resolved",
      (error: unknown) => codeOf(error),
    );

    expect(outcome).not.toBe("resolved");
    expect(router.isActive()).toBe(false);
    // No phantom state committed on the disposed router.
    expect(router.getState()).toBeUndefined();
  });
});

/**
 * The gate's second job, which its absorption into `when: mayCommit` lost.
 *
 * The #1169 gate stood in `executeNavigation` BEFORE `completeTransition`, so a
 * cancelled navigation never entered that function at all. Moving the verdict
 * onto the `COMPLETE` edge moved it AFTER `completeTransition`'s post-leave
 * cleanup — and that cleanup is DESTRUCTIVE: it unregisters the departing
 * route's EXTERNAL `canDeactivate`. A cancelled navigation was therefore eating
 * the guard of the route the user was STAYING on, and the next departure went
 * unguarded.
 *
 * Measured A/B against `4c3b95424` before the fix: base refused the second
 * navigation with CANNOT_DEACTIVATE, HEAD let it through. Discriminating —
 * deleting the early ask in `completeTransition` reds the first test here.
 *
 * `createRouter` rather than `createTestRouter`: the shared fixture carries
 * definition guards, and this is about an EXTERNAL one on the route being left.
 */
describe("commit-gate #1169 — a cancelled navigation keeps the guard it did not use", () => {
  const ROUTES = [
    { name: "a", path: "/a" },
    { name: "b", path: "/b" },
  ];

  const guardedRouterOnA = async (): Promise<{
    router: ReturnType<typeof createRouter>;
    allow: (value: boolean) => void;
    calls: () => number;
  }> => {
    const router = createRouter(ROUTES);
    let allow = true;
    const guard = vi.fn(() => allow);

    getLifecycleApi(router).addDeactivateGuard("a", () => guard);

    await router.start("/a");

    return {
      router,
      allow: (value: boolean) => {
        allow = value;
      },
      calls: () => guard.mock.calls.length,
    };
  };

  it("an aborted opts.signal leaves the external canDeactivate registered", async () => {
    const { router, allow, calls } = await guardedRouterOnA();
    const controller = new AbortController();

    // Aborts in the leave window: after the deactivate guard ran, before commit.
    router.subscribeLeave(() => {
      controller.abort();
    });

    const first = await router
      .navigate("b", {}, undefined, { signal: controller.signal })
      .then(
        () => "resolved",
        (error: unknown) => codeOf(error),
      );

    expect(first).toBe(errorCodes.TRANSITION_CANCELLED);
    expect(router.getState()?.name).toBe("a");

    // The guard must still be there — and still able to refuse.
    allow(false);

    const second = await router.navigate("b").then(
      () => "resolved",
      (error: unknown) => codeOf(error),
    );

    expect(second).toBe(errorCodes.CANNOT_DEACTIVATE);
    expect(router.getState()?.name).toBe("a");
    expect(calls()).toBe(2);
  });

  /**
   * ⚑ **THE cell that discriminates, and `forceDeactivate` is what makes it
   * reach the code it is about.**
   *
   * Its sibling above pins the same OUTCOME through an aborted `opts.signal`,
   * and that arc never reaches `completeTransition` at all — so the destructive
   * cleanup below the ask never runs and a mis-ordered ask has nothing to eat.
   * Measured by instrumenting the ask across this whole file: every refusal that
   * DID reach it carried an EMPTY cleanup, and the one navigation with a
   * cleanable guard committed. That is why moving the ask back below the cleanup
   * left the tier green — the mistake the type now forbids was invisible.
   *
   * The two conditions look mutually exclusive, and that is the trap: the
   * cleanup is non-empty only when the departing route has an external
   * `canDeactivate`, and such a navigation walks the guard pipeline, where a
   * cancel is caught by the liveness fence long before the commit.
   * `forceDeactivate` is the one legitimate arc that separates them — it skips
   * the deactivate PHASE (the guard is not consulted, hence one call and not
   * two) while `planPhases` still fills `canDeactivateFunctions`, so the
   * navigation reaches `completeTransition` with a cleanup that has something to
   * destroy and a `stop()` that makes the table refuse it.
   */
  it("stop() from a sync subscribeLeave leaves the external canDeactivate registered", async () => {
    const { router, allow, calls } = await guardedRouterOnA();

    const stopOnLeave = router.subscribeLeave(() => {
      router.stop();
    });

    const first = await router
      .navigate("b", {}, undefined, { forceDeactivate: true })
      .then(
        () => "resolved",
        (error: unknown) => codeOf(error),
      );

    expect(first).toBe(errorCodes.TRANSITION_CANCELLED);
    expect(router.isActive()).toBe(false);

    // The navigation was refused, so the guard of the route the user is staying
    // on must have survived it — that is the #1641 BLOCKER this ordering exists
    // for.
    // Unsubscribed BEFORE the second navigation so the assertion below can only
    // be about the guard: with the listener still live, a mis-ordered ask would
    // red this cell through a second `stop()` instead of through the guard it
    // ate, which is a coincidence and not a discrimination.
    stopOnLeave();

    await router.start("/a");
    allow(false);

    const second = await router.navigate("b").then(
      () => "resolved",
      (error: unknown) => codeOf(error),
    );

    expect(second).toBe(errorCodes.CANNOT_DEACTIVATE);
    expect(router.getState()?.name).toBe("a");
    // ONE call, not two: the cancelled navigation skipped the deactivate phase.
    expect(calls()).toBe(1);
  });

  it("a navigation that DOES commit still clears it — the cleanup is not disabled", async () => {
    const { router, calls } = await guardedRouterOnA();

    await expect(router.navigate("b")).resolves.toMatchObject({ name: "b" });
    expect(calls()).toBe(1);

    // Back to `a`, then away again: the guard was unregistered on the way out,
    // so it is not consulted a second time.
    await router.navigate("a");

    await expect(router.navigate("b")).resolves.toMatchObject({ name: "b" });
    expect(calls()).toBe(1);
  });
});
