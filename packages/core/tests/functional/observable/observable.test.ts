import { logger } from "@real-router/logger";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { errorCodes, events } from "@real-router/core";

import { createTestRouter } from "../../helpers";

import type { Router } from "@real-router/core";

let router: Router;
const noop = () => undefined;

describe("core/observable", () => {
  beforeEach(() => {
    router = createTestRouter().start();
  });

  afterEach(() => {
    router.stop();
  });

  describe("addEventListener", () => {
    describe("event triggering via real operations", () => {
      it("should trigger ROUTER_START listener when router starts", () => {
        const freshRouter = createTestRouter();
        const cb = vi.fn();

        freshRouter.addEventListener(events.ROUTER_START, cb);
        freshRouter.start();

        expect(cb).toHaveBeenCalledTimes(1);
        expect(cb).toHaveBeenCalledWith();

        freshRouter.stop();
      });

      it("should trigger ROUTER_STOP listener when router stops", () => {
        const cb = vi.fn();

        router.addEventListener(events.ROUTER_STOP, cb);
        router.stop();

        expect(cb).toHaveBeenCalledTimes(1);
        expect(cb).toHaveBeenCalledWith();
      });

      it("should trigger TRANSITION_START listener during navigation", () => {
        const cb = vi.fn();

        router.addEventListener(events.TRANSITION_START, cb);
        router.navigate("users");

        expect(cb).toHaveBeenCalledTimes(1);
        expect(cb).toHaveBeenCalledWith(
          expect.objectContaining({ name: "users" }),
          expect.objectContaining({ name: "home" }),
        );
      });

      it("should trigger TRANSITION_SUCCESS listener after successful navigation", () => {
        const cb = vi.fn();

        router.addEventListener(events.TRANSITION_SUCCESS, cb);
        router.navigate("users", {}, {}, (err) => {
          expect(err).toBeUndefined();
        });

        expect(cb).toHaveBeenCalledTimes(1);
        expect(cb).toHaveBeenCalledWith(
          expect.objectContaining({ name: "users" }),
          expect.objectContaining({ name: "home" }),
          expect.any(Object),
        );
      });

      it("should trigger TRANSITION_ERROR listener when navigation fails", () => {
        const cb = vi.fn();

        router.canActivate("admin-protected", () => () => false);
        router.addEventListener(events.TRANSITION_ERROR, cb);
        router.navigate("admin-protected", {}, {}, (err) => {
          expect(err?.code).toBe(errorCodes.CANNOT_ACTIVATE);
        });

        expect(cb).toHaveBeenCalledTimes(1);
        expect(cb).toHaveBeenCalledWith(
          expect.objectContaining({ name: "admin-protected" }),
          expect.objectContaining({ name: "home" }),
          expect.objectContaining({ code: errorCodes.CANNOT_ACTIVATE }),
        );
      });

      it("should trigger TRANSITION_CANCEL listener when navigation is cancelled", () => {
        const cb = vi.fn();
        let middlewareResolve: Function | undefined;

        // Use middleware to delay first navigation
        router.useMiddleware(() => (_toState, _fromState, done) => {
          middlewareResolve = done;
        });

        router.addEventListener(events.TRANSITION_CANCEL, cb);

        // First navigation - will be delayed
        router.navigate("users");

        // Second navigation - cancels the first
        router.navigate("orders");

        expect(cb).toHaveBeenCalledTimes(1);
        expect(cb).toHaveBeenCalledWith(
          expect.objectContaining({ name: "users" }),
          expect.objectContaining({ name: "home" }),
        );

        // Clean up - let pending navigation complete
        middlewareResolve?.();
      });

      it("should not break other listeners if one throws", () => {
        vi.spyOn(logger, "error").mockImplementation(noop);

        const freshRouter = createTestRouter();
        const goodCb = vi.fn();
        const badCb = vi.fn(() => {
          throw new Error("listener failed");
        });

        freshRouter.addEventListener(events.ROUTER_START, badCb);
        freshRouter.addEventListener(events.ROUTER_START, goodCb);

        expect(() => {
          freshRouter.start();
        }).not.toThrowError();

        expect(goodCb).toHaveBeenCalled();

        freshRouter.stop();
      });
    });

    describe("unsubscribe functionality", () => {
      it("should return an unsubscribe function", () => {
        const cb = vi.fn();
        const unsubscribe = router.addEventListener(events.ROUTER_STOP, cb);

        expect(typeof unsubscribe).toBe("function");
      });

      it("should not call listener after unsubscribe", () => {
        const cb = vi.fn();
        const unsubscribe = router.addEventListener(events.ROUTER_STOP, cb);

        unsubscribe();
        router.stop();

        expect(cb).not.toHaveBeenCalled();
      });

      it("should allow unsubscribing multiple times without error", () => {
        const cb = vi.fn();
        const unsubscribe = router.addEventListener(events.ROUTER_STOP, cb);

        unsubscribe();

        expect(() => {
          unsubscribe();
        }).not.toThrowError();
      });

      it("should warn when unsubscribing a listener that was already removed", () => {
        const warnSpy = vi.spyOn(logger, "warn").mockImplementation(noop);

        const cb1 = vi.fn();
        const cb2 = vi.fn();

        // Add two listeners to ensure set is not empty after first removal
        router.addEventListener(events.ROUTER_STOP, cb1);
        const unsubscribe2 = router.addEventListener(events.ROUTER_STOP, cb2);

        // First unsubscribe - should succeed without warning
        unsubscribe2();

        expect(warnSpy).not.toHaveBeenCalled();

        // Second unsubscribe - should warn (set still has cb1, but cb2 is gone)
        unsubscribe2();

        expect(warnSpy).toHaveBeenCalledWith(
          "Router",
          expect.stringContaining("non-existent listener"),
        );

        warnSpy.mockRestore();
      });

      it("should only unsubscribe the specific listener", () => {
        const cb1 = vi.fn();
        const cb2 = vi.fn();

        const unsubscribe1 = router.addEventListener(events.ROUTER_STOP, cb1);

        router.addEventListener(events.ROUTER_STOP, cb2);

        unsubscribe1();
        router.stop();

        expect(cb1).not.toHaveBeenCalled();
        expect(cb2).toHaveBeenCalled();
      });
    });

    describe("validation", () => {
      it("should throw TypeError for invalid event name", () => {
        expect(() => {
          router.addEventListener("invalid-event" as any, () => {});
        }).toThrowError("Invalid event name");
      });

      it("should throw TypeError for non-function callback", () => {
        expect(() => {
          router.addEventListener(events.ROUTER_START, "not-a-function" as any);
        }).toThrowError(TypeError);
        expect(() => {
          router.addEventListener(events.ROUTER_START, "not-a-function" as any);
        }).toThrowError("Expected callback to be a function");
      });

      it("should throw when adding duplicate listener", () => {
        const cb = vi.fn();

        router.addEventListener(events.ROUTER_START, cb);

        expect(() => {
          router.addEventListener(events.ROUTER_START, cb);
        }).toThrowError("Listener already exists");
      });
    });
  });

  describe("subscribe", () => {
    describe("basic functionality", () => {
      it("should accept a listener function", () => {
        const unsubscribe = router.subscribe(() => undefined);

        expect(typeof unsubscribe).toStrictEqual("function");
      });

      it("should call listener on TRANSITION_SUCCESS", () => {
        const listener = vi.fn();
        const previousState = router.getState();

        router.subscribe(listener);
        router.navigate("users", {}, {}, (err) => {
          expect(err).toBeUndefined();
        });

        expect(listener).toHaveBeenCalledWith({
          route: expect.objectContaining({ name: "users" }),
          previousRoute: previousState,
        });
      });

      it("should not call subscriber after unsubscribe", () => {
        const spy = vi.fn();
        const unsubscribe = router.subscribe(spy);

        unsubscribe();
        router.navigate("users");

        expect(spy).not.toHaveBeenCalled();
      });

      it("should notify all subscribers", () => {
        const spy1 = vi.fn();
        const spy2 = vi.fn();
        const unsub1 = router.subscribe(spy1);
        const unsub2 = router.subscribe(spy2);

        router.navigate("users");

        expect(spy1).toHaveBeenCalled();
        expect(spy2).toHaveBeenCalled();

        unsub1();
        unsub2();
      });

      it("should allow calling unsubscribe multiple times safely", () => {
        const spy = vi.fn();
        const unsubscribe = router.subscribe(spy);

        unsubscribe();

        expect(() => {
          unsubscribe();
        }).not.toThrowError();
      });
    });

    describe("validation", () => {
      it("should throw TypeError for non-function listener", () => {
        expect(() => {
          router.subscribe("not-a-function" as any);
        }).toThrowError(TypeError);
        expect(() => {
          router.subscribe("not-a-function" as any);
        }).toThrowError("[router.subscribe] Expected a function");
      });

      it("should throw TypeError for null listener", () => {
        expect(() => {
          router.subscribe(null as any);
        }).toThrowError(TypeError);
      });

      it("should throw TypeError for object listener", () => {
        expect(() => {
          router.subscribe({ subscribe: () => {} } as any);
        }).toThrowError(TypeError);
      });
    });
  });
});
