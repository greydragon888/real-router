import {
  describe,
  beforeEach,
  afterEach,
  it,
  expect,
  expectTypeOf,
} from "vitest";

import { errorCodes, events } from "@real-router/core";

import { createTestRouter } from "../../../helpers";

import type { Router } from "@real-router/core";

let router: Router;

describe("router.navigate() - router not started", () => {
  beforeEach(() => {
    router = createTestRouter();

    router.start();
  });

  afterEach(() => {
    router.stop();

    vi.clearAllMocks();
  });

  describe("navigation when router is not started", () => {
    beforeEach(() => {
      // Ensure router is stopped before each test
      router.stop();
    });

    afterEach(() => {
      // Restore router state for other tests
      router.start();
    });

    it("should call callback with ROUTER_NOT_STARTED error", async () => {
      await new Promise<void>((resolve) => {
        router.navigate("users", (err) => {
          expect(err).toBeDefined();
          expect(err?.code).toBe(errorCodes.ROUTER_NOT_STARTED);
          resolve();
        });
      });
    });

    it("should return noop function when router is not started", async () => {
      const result = await new Promise<any>((resolve) => {
        const cancel = router.navigate("users", () => {
          resolve(cancel);
        });
      });

      expectTypeOf(result).toBeFunction();

      // Verify it's a noop function by calling it multiple times
      expect(() => {
        result();
        result();
        result();
      }).not.toThrowError();
    });

    it("should not continue navigation process", async () => {
      const onStart = vi.fn();
      const onSuccess = vi.fn();
      const onError = vi.fn();

      // Set up event listeners to verify no navigation events
      const unsubStart = router.addEventListener(
        events.TRANSITION_START,
        onStart,
      );
      const unsubSuccess = router.addEventListener(
        events.TRANSITION_SUCCESS,
        onSuccess,
      );
      const unsubError = router.addEventListener(
        events.TRANSITION_ERROR,
        onError,
      );

      await new Promise<void>((resolve) => {
        router.navigate("users", () => {
          resolve();
        });
      });

      // Only callback should be called, no transition events
      expect(onStart).not.toHaveBeenCalled();
      expect(onSuccess).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();

      unsubStart();
      unsubSuccess();
      unsubError();
    });

    it("should handle navigation with parameters when router not started", async () => {
      await new Promise<void>((resolve) => {
        router.navigate("users.view", { id: 123 }, (err) => {
          expect(err).toBeDefined();
          expect(err?.code).toBe(errorCodes.ROUTER_NOT_STARTED);
          resolve();
        });
      });
    });

    it("should handle navigation with options when router not started", async () => {
      const options = { replace: true, source: "test" };

      await new Promise<void>((resolve) => {
        router.navigate("profile", {}, options, (err) => {
          expect(err).toBeDefined();
          expect(err?.code).toBe(errorCodes.ROUTER_NOT_STARTED);
          resolve();
        });
      });
    });

    it("should handle multiple navigate calls when router not started", async () => {
      const cancels: any[] = [];

      await new Promise<void>((resolve) => {
        let count = 0;
        const callback = (err: any) => {
          expect(err).toBeDefined();
          expect(err?.code).toBe(errorCodes.ROUTER_NOT_STARTED);
          count++;
          if (count === 3) resolve();
        };

        cancels.push(router.navigate("users", callback));
        cancels.push(router.navigate("profile", callback));
        cancels.push(router.navigate("orders", callback));
      });

      // All should return noop functions
      expectTypeOf(cancels[0]).toBeFunction();
      expectTypeOf(cancels[1]).toBeFunction();
      expectTypeOf(cancels[2]).toBeFunction();
    });

    it("should not trigger guards or middleware when router not started", async () => {
      const guard = vi.fn().mockReturnValue(true);
      const middleware = vi.fn();

      router.addActivateGuard("users", () => guard);
      router.useMiddleware(() => middleware);

      await new Promise<void>((resolve) => {
        router.navigate("users", () => {
          resolve();
        });
      });

      expect(guard).not.toHaveBeenCalled();
      expect(middleware).not.toHaveBeenCalled();

      router.clearMiddleware();
    });

    it("should handle invalid route names when router not started", async () => {
      await new Promise<void>((resolve) => {
        router.navigate("nonexistent.route", (err) => {
          expect(err).toBeDefined();
          expect(err?.code).toBe(errorCodes.ROUTER_NOT_STARTED);
          resolve();
        });
      });
    });

    it("should return noop function that is safe to call", async () => {
      const cancel = await new Promise<any>((resolve) => {
        const c = router.navigate("users", () => {
          resolve(c);
        });
      });

      // Verify calling the noop function doesn't throw or cause issues
      expect(() => {
        cancel();
      }).not.toThrowError();
    });

    it("should work correctly after router is started", async () => {
      // Verify router is stopped
      expect(router.isActive()).toBe(false);

      await new Promise<void>((resolve) => {
        router.navigate("users", (err) => {
          expect(err).toBeDefined();
          expect(err?.code).toBe(errorCodes.ROUTER_NOT_STARTED);
          resolve();
        });
      });

      // Start router and try again
      router.start();

      expect(router.isActive()).toBe(true);

      await new Promise<void>((resolve) => {
        router.navigate("users", (err, state) => {
          expect(err).toBeUndefined();
          expect(state).toBeDefined();
          expect(state?.name).toBe("users");
          resolve();
        });
      });
    });

    it("should emit no events when router is not started", async () => {
      const onTransitionStart = vi.fn();
      const onTransitionCancel = vi.fn();
      const onTransitionError = vi.fn();
      const onTransitionSuccess = vi.fn();

      const unsubStart = router.addEventListener(
        events.TRANSITION_START,
        onTransitionStart,
      );
      const unsubCancel = router.addEventListener(
        events.TRANSITION_CANCEL,
        onTransitionCancel,
      );
      const unsubError = router.addEventListener(
        events.TRANSITION_ERROR,
        onTransitionError,
      );
      const unsubSuccess = router.addEventListener(
        events.TRANSITION_SUCCESS,
        onTransitionSuccess,
      );

      await new Promise<void>((resolve) => {
        router.navigate("users", () => {
          resolve();
        });
      });

      // No transition events should be emitted
      expect(onTransitionStart).not.toHaveBeenCalled();
      expect(onTransitionCancel).not.toHaveBeenCalled();
      expect(onTransitionError).not.toHaveBeenCalled();
      expect(onTransitionSuccess).not.toHaveBeenCalled();

      unsubStart();
      unsubCancel();
      unsubError();
      unsubSuccess();
    });

    it("should handle navigation without callback when router not started", async () => {
      // This should not throw even without callback
      await new Promise<void>((resolve) => {
        expect(() => {
          const cancel = router.navigate("users");

          expectTypeOf(cancel).toBeFunction();
        }).not.toThrowError();

        setTimeout(resolve, 0);
      });
    });

    it("should return ROUTER_NOT_STARTED error with correct properties", async () => {
      const error = await new Promise<any>((resolve) => {
        router.navigate("users", (err) => {
          resolve(err);
        });
      });

      expect(error).toStrictEqual(
        expect.objectContaining({
          code: errorCodes.ROUTER_NOT_STARTED,
          message: "NOT_STARTED",
        }),
      );

      expect(error.code).toBe(errorCodes.ROUTER_NOT_STARTED);
    });
  });
});
