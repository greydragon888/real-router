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

describe("rethrowAsRouterError — a thrown RouterError is re-coded (as a copy, #1606)", () => {
  it("re-codes a thrown RouterError instead of wrapping it (message preserved)", async () => {
    const error = await navigateError(
      routerWithActivateGuard(() => {
        throw new RouterError(errorCodes.TRANSITION_ERR, { message: "boom" });
      }),
    );

    // re-code path: the guard's code wins, the original message survives.
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

describe("rethrowAsRouterError — a caught RouterError is never mutated (#1606)", () => {
  // The three cached rejection errors (SAME_STATES / ROUTE_NOT_FOUND /
  // ROUTER_NOT_STARTED) are module-level singletons shared by every router in
  // the process. A guard that merely awaits a navigation rejecting with one of
  // them lets the rejection propagate into handleGuardError → rethrow, which
  // must NOT rewrite the singleton's code in place — that would poison every
  // later consumer of the same error class, across routers (SSR: across
  // requests).

  it("a fresh SAME_STATES rejection keeps its code after a guard awaited one", async () => {
    const router = createRouter(ROUTES, { defaultRoute: "home" });

    getLifecycleApi(router).addActivateGuard("page", () => async () => {
      await router.navigate("home"); // same state → rejects with the cached SAME_STATES error

      return true;
    });

    await router.start("/");
    await router.navigate("page").catch(() => {});

    const fresh = await router.navigate("home").then(
      () => undefined,
      (error: unknown) => error as RouterError,
    );

    expect(fresh?.code).toBe(errorCodes.SAME_STATES);
    expect(fresh?.message).toBe(errorCodes.SAME_STATES);
  });

  it("a fresh ROUTE_NOT_FOUND rejection keeps its code after a guard awaited one", async () => {
    const router = createRouter(ROUTES, { defaultRoute: "home" });

    getLifecycleApi(router).addActivateGuard("page", () => async () => {
      await router.navigate("missing-route"); // → rejects with the cached ROUTE_NOT_FOUND error

      return true;
    });

    await router.start("/");
    await router.navigate("page").catch(() => {});

    const fresh = await router.navigate("missing-route").then(
      () => undefined,
      (error: unknown) => error as RouterError,
    );

    expect(fresh?.code).toBe(errorCodes.ROUTE_NOT_FOUND);
  });

  it("a guard on one router does not poison ROUTER_NOT_STARTED for ANOTHER router", async () => {
    // The blast radius is the process, not the router: the singleton lives at
    // module scope, so one router's guard corrupting it would rewrite the
    // error every OTHER router (e.g. an SSR per-request clone) rejects with.
    const cold = createRouter(ROUTES);
    const router = createRouter(ROUTES, { defaultRoute: "home" });

    getLifecycleApi(router).addActivateGuard("page", () => async () => {
      await cold.navigate("home"); // not started → rejects with the cached ROUTER_NOT_STARTED error

      return true;
    });

    await router.start("/");
    await router.navigate("page").catch(() => {});

    const fresh = await cold.navigate("home").then(
      () => undefined,
      (error: unknown) => error as RouterError,
    );

    expect(fresh?.code).toBe(errorCodes.ROUTER_NOT_STARTED);
  });

  it("does not mutate the guard's own thrown RouterError (the caller sees a re-coded copy)", async () => {
    const thrown = new RouterError(errorCodes.TRANSITION_ERR, {
      message: "boom",
      extra: "field",
    });

    const error = await navigateError(
      routerWithActivateGuard(() => {
        throw thrown;
      }),
    );

    // The consumer sees the guard's code with the original metadata carried over…
    expect(error?.code).toBe(errorCodes.CANNOT_ACTIVATE);
    expect(error?.message).toBe("boom");
    expect((error as unknown as { extra?: string }).extra).toBe("field");

    // …while the instance the guard threw (and may still own) is untouched.
    expect(thrown.code).toBe(errorCodes.TRANSITION_ERR);
    expect(thrown.message).toBe("boom");
  });

  it("re-codes a thrown RouterError that carries no stack", async () => {
    const thrown = new RouterError(errorCodes.TRANSITION_ERR);

    // A stack is not guaranteed on an Error (e.g. Error.stackTraceLimit = 0
    // environments); the copy must not choke on its absence.
    delete (thrown as { stack?: string }).stack;

    const error = await navigateError(
      routerWithActivateGuard(() => {
        throw thrown;
      }),
    );

    expect(error?.code).toBe(errorCodes.CANNOT_ACTIVATE);
    expect(error?.stack).toBe("");
  });
});

describe("cached rejection errors are frozen (#1606 backstop)", () => {
  it("an in-place write to a caught cached error throws instead of silently corrupting the process", async () => {
    const router = createRouter(ROUTES); // deliberately NOT started

    const caught = await router.navigate("home").then(
      () => undefined,
      (error: unknown) => error as RouterError,
    );

    expect(caught?.code).toBe(errorCodes.ROUTER_NOT_STARTED);

    // The instance is a process-wide singleton: a strict-mode write must throw
    // (sloppy-mode writes become silent no-ops) — either way the corruption
    // cannot reach the next consumer of the same error class.
    expect(() => {
      caught!.code = "X";
    }).toThrow(TypeError);
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

  it("does not leak `then` from a thrown thenable onto the RouterError (#947)", async () => {
    const router = routerWithActivateGuard(() => {
      // A thenable thrown by a guard would otherwise make the wrapped
      // RouterError itself thenable — a foot-gun for any consumer that awaits
      // (or Promise.resolve()s / returns from async) the error.
      // eslint-disable-next-line @typescript-eslint/only-throw-error, unicorn/no-thenable -- deliberately throwing a thenable object to exercise wrapSyncError's `then` filter (#947)
      throw { then: () => {}, kept: "v" };
    });

    await router.start("/");

    // Capture the rejection WITHOUT returning the error from the handler: a
    // thenable returned into a resolving position is assimilated, and a no-op
    // `then` would hang the test — exactly the foot-gun #947 guards against.
    let caught: unknown;

    await router.navigate("page").then(
      () => undefined,
      (error: unknown) => {
        caught = error;
      },
    );

    expect(caught).toBeInstanceOf(RouterError);
    expect((caught as RouterError).code).toBe(errorCodes.CANNOT_ACTIVATE);
    expect(typeof (caught as { then?: unknown }).then).not.toBe("function");
    // The fix is surgical — non-`then` own props still flow through as metadata.
    expect((caught as { kept: string }).kept).toBe("v");
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
