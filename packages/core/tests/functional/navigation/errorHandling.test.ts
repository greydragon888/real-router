import { describe, it, expect, vi } from "vitest";

import { createRouter, errorCodes, RouterError } from "@real-router/core";
import { getLifecycleApi, getRoutesApi } from "@real-router/core/api";

import type { GuardFn, Router } from "@real-router/core";

/**
 * Transition error-handling (`transition/errorHandling.ts`:
 * routeTransitionError / handleGuardError / rethrowAsRouterError / wrapSyncError)
 * exercised through the PUBLIC pipeline — `navigate()` with throwing guards. This
 * proves the helpers are actually WIRED into the pipeline (a direct unit call
 * cannot), and every branch is observable:
 *   - the rejected `RouterError` carries `code` (handleGuardError / rethrow) plus
 *     the `wrapSyncError` metadata (`segment`, `cause`, spread own-props, #39
 *     reserved-prop filtering);
 *   - an `onTransitionError` plugin observes `routeTransitionError`'s suppression
 *     list (cancelled / not-found are swallowed; genuine errors are reported once).
 */

const ROUTES = [
  { name: "home", path: "/" },
  { name: "page", path: "/page" },
];

function routerWithActivateGuard(guard: GuardFn): Router {
  const router = createRouter(ROUTES, { defaultRoute: "home" });

  getLifecycleApi(router).addActivateGuard("page", () => guard);

  return router;
}

/** Navigate to `page` and return the rejected error (or undefined if resolved). */
async function navigateError(
  router: Router,
  to = "page",
): Promise<RouterError | undefined> {
  await router.start("/");

  return router.navigate(to).then(
    () => undefined,
    (error: unknown) => error as RouterError,
  );
}

describe("routeTransitionError — suppression list (via onTransitionError plugin)", () => {
  it("reports a genuine error (CANNOT_ACTIVATE) exactly once", async () => {
    const onTransitionError = vi.fn();
    const router = routerWithActivateGuard(() => {
      throw new Error("boom");
    });

    router.usePlugin(() => ({ onTransitionError }));

    const error = await navigateError(router);

    expect(error?.code).toBe(errorCodes.CANNOT_ACTIVATE);
    expect(onTransitionError).toHaveBeenCalledTimes(1);
    expect(onTransitionError).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ code: errorCodes.CANNOT_ACTIVATE }),
    );
  });

  it("swallows TRANSITION_CANCELLED (AbortError guard) — no onTransitionError", async () => {
    const onTransitionError = vi.fn();
    const router = routerWithActivateGuard(() => {
      throw new DOMException("aborted", "AbortError");
    });

    router.usePlugin(() => ({ onTransitionError }));

    const error = await navigateError(router);

    expect(error?.code).toBe(errorCodes.TRANSITION_CANCELLED);
    expect(onTransitionError).not.toHaveBeenCalled();
  });

  it("swallows ROUTE_NOT_FOUND when a route vanishes mid-transition (reports once, not twice)", async () => {
    // The target route is removed while an async activation guard is pending.
    // completeTransition then sees `!hasRoute` → emits the fail ITSELF and throws
    // ROUTE_NOT_FOUND; routeTransitionError must swallow it so the error is
    // reported exactly once (a missing suppression would double-report).
    const onTransitionError = vi.fn();
    const router = createRouter(ROUTES, { defaultRoute: "home" });

    router.usePlugin(() => ({ onTransitionError }));

    let enterGuard!: () => void;
    const entered = new Promise<void>((resolve) => {
      enterGuard = resolve;
    });
    let releaseGuard!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseGuard = resolve;
    });

    getLifecycleApi(router).addActivateGuard("page", () => async () => {
      enterGuard();
      await gate;

      return true;
    });

    await router.start("/");

    const pending = router.navigate("page").then(
      () => undefined,
      (error: unknown) => error as RouterError,
    );

    await entered; // guard is now suspended
    getRoutesApi(router).remove("page"); // target route disappears
    releaseGuard();

    const error = await pending;

    expect(error?.code).toBe(errorCodes.ROUTE_NOT_FOUND);
    expect(onTransitionError).toHaveBeenCalledTimes(1);
  });
});

describe("handleGuardError — AbortError detection", () => {
  it("a DOMException AbortError becomes TRANSITION_CANCELLED", async () => {
    const error = await navigateError(
      routerWithActivateGuard(() => {
        throw new DOMException("aborted", "AbortError");
      }),
    );

    expect(error?.code).toBe(errorCodes.TRANSITION_CANCELLED);
  });

  it("a non-AbortError DOMException keeps the guard's errorCode", async () => {
    const error = await navigateError(
      routerWithActivateGuard(() => {
        throw new DOMException("nope", "NotFoundError");
      }),
    );

    expect(error?.code).toBe(errorCodes.CANNOT_ACTIVATE);
  });
});

describe("handleGuardError — explicit RouterError(TRANSITION_CANCELLED) is preserved", () => {
  it("a guard that throws RouterError(TRANSITION_CANCELLED) keeps that code (not re-coded to CANNOT_ACTIVATE)", async () => {
    // A guard that throws RouterError(TRANSITION_CANCELLED) is explicitly
    // signalling a quiet cancel — the same intent as a thrown AbortError.
    // It must NOT be re-coded to CANNOT_ACTIVATE (#933), otherwise the quiet
    // cancel turns into a reported transition error.
    const onTransitionError = vi.fn();
    const router = routerWithActivateGuard(() => {
      throw new RouterError(errorCodes.TRANSITION_CANCELLED);
    });

    router.usePlugin(() => ({ onTransitionError }));

    const error = await navigateError(router);

    expect(error?.code).toBe(errorCodes.TRANSITION_CANCELLED);
    expect(onTransitionError).not.toHaveBeenCalled();
  });
});

describe("rethrowAsRouterError — RouterError keeps identity, gets re-coded", () => {
  it("re-codes a thrown RouterError instead of wrapping it (message preserved)", async () => {
    const error = await navigateError(
      routerWithActivateGuard(() => {
        throw new RouterError(errorCodes.TRANSITION_ERR, { message: "boom" });
      }),
    );

    // setCode path: the guard's code wins, the original message survives.
    expect(error).toBeInstanceOf(RouterError);
    expect(error?.code).toBe(errorCodes.CANNOT_ACTIVATE);
    expect(error?.message).toContain("boom");
  });

  it("wraps a non-RouterError throw with the guard's code", async () => {
    const error = await navigateError(
      routerWithActivateGuard(() => {
        throw new Error("raw");
      }),
    );

    expect(error).toBeInstanceOf(RouterError);
    expect(error?.code).toBe(errorCodes.CANNOT_ACTIVATE);
  });
});

describe("wrapSyncError — metadata extraction (via the rejected RouterError)", () => {
  it("extracts Error.cause when present", async () => {
    const error = await navigateError(
      routerWithActivateGuard(() => {
        throw new Error("x", { cause: "root-cause" });
      }),
    );

    expect((error as unknown as { cause: unknown }).cause).toBe("root-cause");
  });

  it("omits the cause key entirely for an Error without a cause", async () => {
    const error = await navigateError(
      routerWithActivateGuard(() => {
        throw new Error("x");
      }),
    );

    expect("cause" in (error as object)).toBe(false);
  });

  it("filters reserved props (#39) and keeps the real segment, dropping injected ones", async () => {
    const error = await navigateError(
      routerWithActivateGuard(() => {
        // segment/path/code are reserved — must NOT override RouterError's own.
        // eslint-disable-next-line @typescript-eslint/only-throw-error -- deliberately throwing a non-Error object to exercise wrapSyncError's reserved-prop filter (#39)
        throw {
          segment: "INJECTED",
          path: "/injected",
          code: "HACK",
          kept: "v",
        };
      }),
    );

    expect(error?.code).toBe(errorCodes.CANNOT_ACTIVATE); // not "HACK"
    expect(error?.segment).toBe("page"); // the real route segment, not "INJECTED"
    expect(error).not.toHaveProperty("path", "/injected");
    expect((error as unknown as { kept: string }).kept).toBe("v"); // non-reserved survives
  });

  it("returns base-only metadata for a primitive throw (no enumerable spread)", async () => {
    const error = await navigateError(
      routerWithActivateGuard(() => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error -- deliberately throwing a primitive to exercise wrapSyncError's base-only path
        throw "just a string";
      }),
    );

    expect(error?.code).toBe(errorCodes.CANNOT_ACTIVATE);
    expect(error?.segment).toBe("page");
  });
});
