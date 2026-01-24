import { logger } from "@real-router/logger";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { events } from "@real-router/core";

import { createTestRouter } from "../../../helpers";

import type { Router } from "@real-router/core";

let router: Router;
const noop = () => undefined;

describe("invokeEventListeners - Null and undefined listeners", () => {
  beforeEach(() => {
    router = createTestRouter();

    router.start();
  });

  afterEach(() => {
    router.stop();
  });

  describe("handling null and undefined listeners", () => {
    it("should skip null and undefined listeners safely", () => {
      const workingListener = vi.fn();

      // Manually inject null and undefined into listeners array
      // This simulates what might happen in edge cases or during cleanup
      router.addEventListener(events.ROUTER_STOP, workingListener);

      // Access internal callbacks to inject null/undefined (simulating edge case)
      const internalCallbacks =
        (router as any).callbacks ?? (router as any)._callbacks;

      // eslint-disable-next-line vitest/no-conditional-in-test -- checking for internal callbacks before manipulating for test
      if (internalCallbacks?.[events.ROUTER_STOP]) {
        internalCallbacks[events.ROUTER_STOP].push(null, undefined);
      }

      expect(() => {
        router.invokeEventListeners(events.ROUTER_STOP);
      }).not.toThrowError();

      expect(workingListener).toHaveBeenCalledWith();
    });

    it("should execute correct listener normally with null/undefined present", () => {
      const correctListener = vi.fn();

      router.addEventListener(events.ROUTER_STOP, correctListener);

      // Simulate null/undefined listeners in the array
      const internalCallbacks =
        (router as any).callbacks ?? (router as any)._callbacks;

      // eslint-disable-next-line vitest/no-conditional-in-test -- checking for internal callbacks before manipulating for test
      if (internalCallbacks?.[events.ROUTER_STOP]) {
        internalCallbacks[events.ROUTER_STOP].unshift(null);
        internalCallbacks[events.ROUTER_STOP].push(undefined, null);
      }

      router.invokeEventListeners(events.ROUTER_STOP);

      expect(correctListener).toHaveBeenCalledWith();
      expect(correctListener).toHaveBeenCalledTimes(1);
    });

    it("should not generate errors when processing empty listeners", () => {
      vi.spyOn(logger, "error").mockImplementation(noop);

      const workingListener = vi.fn();

      router.addEventListener(events.ROUTER_STOP, workingListener);

      // Add null and undefined to listeners array
      const internalCallbacks =
        (router as any).callbacks ?? (router as any)._callbacks;

      // eslint-disable-next-line vitest/no-conditional-in-test -- checking for internal callbacks before manipulating for test
      if (internalCallbacks?.[events.ROUTER_STOP]) {
        internalCallbacks[events.ROUTER_STOP].push(null, undefined);
      }

      router.invokeEventListeners(events.ROUTER_STOP);

      expect(logger.error).not.toHaveBeenCalled();
      expect(workingListener).toHaveBeenCalledWith();
    });

    it("should safely handle invokeFor with empty elements", () => {
      const executionOrder: string[] = [];

      const trackingListener1 = vi.fn(() => {
        executionOrder.push("listener1");
      });
      const trackingListener2 = vi.fn(() => {
        executionOrder.push("listener2");
      });

      router.addEventListener(events.ROUTER_STOP, trackingListener1);
      router.addEventListener(events.ROUTER_STOP, trackingListener2);

      // Insert null/undefined between listeners
      const internalCallbacks =
        (router as any).callbacks ?? (router as any)._callbacks;

      // eslint-disable-next-line vitest/no-conditional-in-test -- checking for internal callbacks before manipulating for test
      if (internalCallbacks?.[events.ROUTER_STOP]) {
        internalCallbacks[events.ROUTER_STOP].splice(1, 0, null, undefined);
      }

      router.invokeEventListeners(events.ROUTER_STOP);

      expect(executionOrder).toStrictEqual(["listener1", "listener2"]);
      expect(trackingListener1).toHaveBeenCalledWith();
      expect(trackingListener2).toHaveBeenCalledWith();
    });

    it("should handle array with only null and undefined listeners", () => {
      // Create scenario where all listeners are null/undefined
      router.addEventListener(events.ROUTER_STOP, vi.fn()); // Add one to create the array

      const internalCallbacks =
        (router as any).callbacks ?? (router as any)._callbacks;

      // eslint-disable-next-line vitest/no-conditional-in-test -- checking for internal callbacks before manipulating for test
      if (internalCallbacks?.[events.ROUTER_STOP]) {
        // Replace all with null/undefined
        internalCallbacks[events.ROUTER_STOP] = [null, undefined, null];
      }

      expect(() => {
        router.invokeEventListeners(events.ROUTER_STOP);
      }).not.toThrowError();
    });

    it("should handle mixed null, undefined, and valid listeners", () => {
      const executionResults: string[] = [];

      const listener1 = vi.fn(() => {
        executionResults.push("executed1");
      });
      const listener2 = vi.fn(() => {
        executionResults.push("executed2");
      });
      const listener3 = vi.fn(() => {
        executionResults.push("executed3");
      });

      router.addEventListener(events.ROUTER_STOP, listener1);
      router.addEventListener(events.ROUTER_STOP, listener2);
      router.addEventListener(events.ROUTER_STOP, listener3);

      // Inject null/undefined at various positions
      const internalCallbacks =
        (router as any).callbacks ?? (router as any)._callbacks;

      // eslint-disable-next-line vitest/no-conditional-in-test -- checking for internal callbacks before manipulating for test
      if (internalCallbacks?.[events.ROUTER_STOP]) {
        const original = [...internalCallbacks[events.ROUTER_STOP]];

        internalCallbacks[events.ROUTER_STOP] = [
          null,
          original[0],
          undefined,
          original[1],
          null,
          original[2],
          undefined,
        ];
      }

      router.invokeEventListeners(events.ROUTER_STOP);

      expect(executionResults).toStrictEqual([
        "executed1",
        "executed2",
        "executed3",
      ]);
      expect(listener1).toHaveBeenCalledWith();
      expect(listener2).toHaveBeenCalledWith();
      expect(listener3).toHaveBeenCalledWith();
    });

    it("should validate if condition correctly filters falsy listeners", () => {
      const workingListener = vi.fn();

      router.addEventListener(events.ROUTER_STOP, workingListener);

      // Test various falsy values that should be skipped
      const internalCallbacks =
        (router as any).callbacks ?? (router as any)._callbacks;

      // eslint-disable-next-line vitest/no-conditional-in-test -- checking for internal callbacks before manipulating for test
      if (internalCallbacks?.[events.ROUTER_STOP]) {
        internalCallbacks[events.ROUTER_STOP].push(
          null,
          undefined,
          false,
          0,
          "",
          Number.NaN,
        );
      }

      expect(() => {
        router.invokeEventListeners(events.ROUTER_STOP);
      }).not.toThrowError();

      expect(workingListener).toHaveBeenCalledWith();
      expect(workingListener).toHaveBeenCalledTimes(1);
    });

    it("should handle transition events with null/undefined listeners", () => {
      const toState = {
        name: "dashboard",
        params: {},
        path: "/dashboard",
      };
      const fromState = { name: "login", params: {}, path: "/login" };

      const workingListener = vi.fn();

      router.addEventListener(events.TRANSITION_START, workingListener);

      // Add null/undefined to transition listeners
      const internalCallbacks =
        (router as any).callbacks ?? (router as any)._callbacks;

      // eslint-disable-next-line vitest/no-conditional-in-test -- checking for internal callbacks before manipulating for test
      if (internalCallbacks?.[events.TRANSITION_START]) {
        internalCallbacks[events.TRANSITION_START].push(null, undefined);
      }

      expect(() => {
        router.invokeEventListeners(
          events.TRANSITION_START,
          toState,
          fromState,
        );
      }).not.toThrowError();

      expect(workingListener).toHaveBeenCalledWith(toState, fromState);
    });

    it("should maintain array integrity during null/undefined filtering", () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      const listener3 = vi.fn();

      router.addEventListener(events.ROUTER_STOP, listener1);
      router.addEventListener(events.ROUTER_STOP, listener2);
      router.addEventListener(events.ROUTER_STOP, listener3);

      // Record original array state
      const internalCallbacks =
        (router as any).callbacks ?? (router as any)._callbacks;
      let originalLength = 0;

      // eslint-disable-next-line vitest/no-conditional-in-test -- checking for internal callbacks before manipulating for test
      if (internalCallbacks?.[events.ROUTER_STOP]) {
        originalLength = internalCallbacks[events.ROUTER_STOP].length;
        internalCallbacks[events.ROUTER_STOP].push(null, undefined);
      }

      router.invokeEventListeners(events.ROUTER_STOP);

      // Array should still contain all elements (including null/undefined)
      /* eslint-disable vitest/no-conditional-in-test, vitest/no-conditional-expect */
      if (internalCallbacks?.[events.ROUTER_STOP]) {
        expect(internalCallbacks[events.ROUTER_STOP]).toHaveLength(
          originalLength + 2,
        );
      }
      /* eslint-enable vitest/no-conditional-in-test, vitest/no-conditional-expect */

      expect(listener1).toHaveBeenCalledWith();
      expect(listener2).toHaveBeenCalledWith();
      expect(listener3).toHaveBeenCalledWith();
    });

    it("should handle edge case of listener becoming null during execution", () => {
      const workingListener = vi.fn();

      // Listener that tries to nullify itself (edge case simulation)
      const selfNullifyingListener = vi.fn(() => {
        // This simulates a listener that might get nullified during execution
        const internalCallbacks =
          (router as any).callbacks ?? (router as any)._callbacks;

        if (internalCallbacks?.[events.ROUTER_STOP]) {
          // This won't affect current execution due to array cloning
          internalCallbacks[events.ROUTER_STOP][0] = null;
        }
      });

      router.addEventListener(events.ROUTER_STOP, selfNullifyingListener);
      router.addEventListener(events.ROUTER_STOP, workingListener);

      expect(() => {
        router.invokeEventListeners(events.ROUTER_STOP);
      }).not.toThrowError();

      expect(selfNullifyingListener).toHaveBeenCalledWith();
      expect(workingListener).toHaveBeenCalledWith();
    });
  });
});
