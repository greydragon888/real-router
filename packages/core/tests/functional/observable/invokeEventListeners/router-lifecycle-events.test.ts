import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { events, RouterError } from "@real-router/core";

import { createTestRouter } from "../../../helpers";

import type { Router, NavigationOptions } from "@real-router/core";

let router: Router;
const noop = () => undefined;

describe("invokeEventListeners - Router lifecycle events", () => {
  beforeEach(() => {
    router = createTestRouter();

    router.start();
  });

  afterEach(() => {
    router.stop();
  });

  describe("default events (ROUTER_START, ROUTER_STOP)", () => {
    describe("successful ROUTER_START event call", () => {
      it("should call all listeners without additional parameters", () => {
        const listener1 = vi.fn();
        const listener2 = vi.fn();
        const listener3 = vi.fn();

        router.addEventListener(events.ROUTER_START, listener1);
        router.addEventListener(events.ROUTER_START, listener2);
        router.addEventListener(events.ROUTER_START, listener3);

        router.invokeEventListeners(events.ROUTER_START);

        expect(listener1).toHaveBeenCalledWith();
        expect(listener2).toHaveBeenCalledWith();
        expect(listener3).toHaveBeenCalledWith();
        expect(listener1).toHaveBeenCalledTimes(1);
        expect(listener2).toHaveBeenCalledTimes(1);
        expect(listener3).toHaveBeenCalledTimes(1);
      });

      it("should use default branch in switch-case for ROUTER_START event", () => {
        const listener = vi.fn();

        router.addEventListener(events.ROUTER_START, listener);

        // ROUTER_START should be handled by default case, not by specific validation cases
        expect(() => {
          router.invokeEventListeners(events.ROUTER_START);
        }).not.toThrowError();

        expect(listener).toHaveBeenCalledWith();
      });

      it("should pass only eventName and listeners array to invokeFor function", () => {
        const listener = vi.fn();

        router.addEventListener(events.ROUTER_START, listener);

        router.invokeEventListeners(events.ROUTER_START);

        // Listener should be called with no arguments (empty parameter list)
        expect(listener).toHaveBeenCalledWith();
        expect(listener.mock.calls[0]).toStrictEqual([]);
      });

      it("should not pass any additional arguments to listeners", () => {
        const listener = vi.fn();

        router.addEventListener(events.ROUTER_START, listener);

        router.invokeEventListeners(events.ROUTER_START);

        // Verify that no arguments were passed to the listener
        expect(listener.mock.calls[0]).toHaveLength(0);
        expect(listener).toHaveBeenCalledWith();
      });

      it("should execute without errors when called with only event name", () => {
        expect(() => {
          router.invokeEventListeners(events.ROUTER_START);
        }).not.toThrowError();
      });

      it("should handle multiple ROUTER_START listeners in registration order", () => {
        const callOrder: number[] = [];

        const listener1 = vi.fn(() => callOrder.push(1));
        const listener2 = vi.fn(() => callOrder.push(2));
        const listener3 = vi.fn(() => callOrder.push(3));

        router.addEventListener(events.ROUTER_START, listener1);
        router.addEventListener(events.ROUTER_START, listener2);
        router.addEventListener(events.ROUTER_START, listener3);

        router.invokeEventListeners(events.ROUTER_START);

        expect(callOrder).toStrictEqual([1, 2, 3]);
        expect(listener1).toHaveBeenCalledWith();
        expect(listener2).toHaveBeenCalledWith();
        expect(listener3).toHaveBeenCalledWith();
      });

      it("should work correctly when no listeners are registered", () => {
        // No listeners registered for ROUTER_START
        expect(() => {
          router.invokeEventListeners(events.ROUTER_START);
        }).not.toThrowError();
      });

      it("should catch and log errors from failing listeners without stopping execution", () => {
        const consoleErrorSpy = vi
          .spyOn(console, "error")
          .mockImplementation(() => {});
        const errorMessage = "ROUTER_START listener error";

        const failingListener = vi.fn(() => {
          throw new Error(errorMessage);
        });
        const workingListener = vi.fn();

        router.addEventListener(events.ROUTER_START, failingListener);
        router.addEventListener(events.ROUTER_START, workingListener);

        router.invokeEventListeners(events.ROUTER_START);

        expect(consoleErrorSpy).toHaveBeenCalledWith(
          "[Router] Error in listener for $start:",
          expect.any(Error),
        );
        expect(failingListener).toHaveBeenCalledWith();
        expect(workingListener).toHaveBeenCalledWith();

        consoleErrorSpy.mockRestore();
      });

      it("should ignore additional parameters if they are accidentally provided", () => {
        const listener = vi.fn();
        const extraParam1 = { name: "test", params: {}, path: "/test" };
        const extraParam2 = { replace: true };

        router.addEventListener(events.ROUTER_START, listener);

        // Even if extra parameters are provided, they should be ignored for default events
        router.invokeEventListeners(
          events.ROUTER_START,
          extraParam1,
          // @ts-expect-error - Testing invalid parameters
          extraParam2,
        );

        // Listener should still be called with no arguments
        expect(listener).toHaveBeenCalledWith();
        expect(listener.mock.calls[0]).toHaveLength(0);
      });
    });

    describe("successful ROUTER_STOP event call", () => {
      it("should call listener without parameters", () => {
        const listener = vi.fn();

        router.addEventListener(events.ROUTER_STOP, listener);

        router.invokeEventListeners(events.ROUTER_STOP);

        expect(listener).toHaveBeenCalledWith();
        expect(listener).toHaveBeenCalledTimes(1);
        expect(listener.mock.calls[0]).toHaveLength(0);
      });

      it("should process through default branch in switch-case", () => {
        const listener = vi.fn();

        router.addEventListener(events.ROUTER_STOP, listener);

        // ROUTER_STOP should be handled by default case without any validation
        expect(() => {
          router.invokeEventListeners(events.ROUTER_STOP);
        }).not.toThrowError();

        expect(listener).toHaveBeenCalledWith();
      });

      it("should complete successfully without errors", () => {
        const listener1 = vi.fn();
        const listener2 = vi.fn();

        router.addEventListener(events.ROUTER_STOP, listener1);
        router.addEventListener(events.ROUTER_STOP, listener2);

        expect(() => {
          router.invokeEventListeners(events.ROUTER_STOP);
        }).not.toThrowError();

        expect(listener1).toHaveBeenCalledWith();
        expect(listener2).toHaveBeenCalledWith();
      });

      it("should handle router stop state correctly through listeners", () => {
        const stopResults: string[] = [];

        const listener1 = vi.fn(() => {
          stopResults.push("Router stopping - cleanup started");
        });

        const listener2 = vi.fn(() => {
          stopResults.push("Router stopped - resources released");
        });

        router.addEventListener(events.ROUTER_STOP, listener1);
        router.addEventListener(events.ROUTER_STOP, listener2);

        router.invokeEventListeners(events.ROUTER_STOP);

        expect(listener1).toHaveBeenCalledWith();
        expect(listener2).toHaveBeenCalledWith();
        expect(stopResults).toStrictEqual([
          "Router stopping - cleanup started",
          "Router stopped - resources released",
        ]);
      });

      it("should work with single listener for ROUTER_STOP", () => {
        const singleListener = vi.fn();

        router.addEventListener(events.ROUTER_STOP, singleListener);

        router.invokeEventListeners(events.ROUTER_STOP);

        expect(singleListener).toHaveBeenCalledWith();
        expect(singleListener).toHaveBeenCalledTimes(1);
      });

      it("should execute without errors when no listeners are registered", () => {
        // No listeners registered for ROUTER_STOP
        expect(() => {
          router.invokeEventListeners(events.ROUTER_STOP);
        }).not.toThrowError();
      });

      it("should handle listener errors without stopping execution", () => {
        vi.spyOn(console, "error").mockImplementation(noop);
        const errorMessage = "ROUTER_STOP listener error";

        const failingListener = vi.fn().mockImplementation(() => {
          throw new Error(errorMessage);
        });

        // Disable logging for this spy
        failingListener.mockName("silentFailingListener");

        const workingListener = vi.fn();

        router.addEventListener(events.ROUTER_STOP, failingListener);
        router.addEventListener(events.ROUTER_STOP, workingListener);

        router.invokeEventListeners(events.ROUTER_STOP);

        expect(console.error).toHaveBeenCalledWith(
          "[Router] Error in listener for $stop:",
          expect.any(Error),
        );
        expect(failingListener).toHaveBeenCalledWith();
        expect(workingListener).toHaveBeenCalledWith();
      });

      it("should call multiple listeners in registration order", () => {
        const callOrder: string[] = [];

        const listener1 = vi.fn(() => callOrder.push("first"));
        const listener2 = vi.fn(() => callOrder.push("second"));
        const listener3 = vi.fn(() => callOrder.push("third"));

        router.addEventListener(events.ROUTER_STOP, listener1);
        router.addEventListener(events.ROUTER_STOP, listener2);
        router.addEventListener(events.ROUTER_STOP, listener3);

        router.invokeEventListeners(events.ROUTER_STOP);

        expect(callOrder).toStrictEqual(["first", "second", "third"]);
        expect(listener1).toHaveBeenCalledWith();
        expect(listener2).toHaveBeenCalledWith();
        expect(listener3).toHaveBeenCalledWith();
      });

      it("should ignore any additional parameters passed to the method", () => {
        const listener = vi.fn();
        const extraParam1 = { name: "test", params: {}, path: "/test" };
        const extraParam2 = { replace: true };

        router.addEventListener(events.ROUTER_STOP, listener);

        // Extra parameters should be ignored for default events
        router.invokeEventListeners(
          events.ROUTER_STOP,
          extraParam1,
          // @ts-expect-error - Testing invalid parameters
          extraParam2,
        );

        // Listener should still be called with no arguments
        expect(listener).toHaveBeenCalledWith();
        expect(listener.mock.calls[0]).toHaveLength(0);
      });

      it("should handle async listeners correctly", () => {
        const asyncListener = vi.fn(async () => {
          await new Promise((resolve) => setTimeout(resolve, 1));

          return "async completed";
        });
        const syncListener = vi.fn();

        // eslint-disable-next-line @typescript-eslint/no-misused-promises -- intentionally testing async listener behavior
        router.addEventListener(events.ROUTER_STOP, asyncListener);
        router.addEventListener(events.ROUTER_STOP, syncListener);

        router.invokeEventListeners(events.ROUTER_STOP);

        expect(asyncListener).toHaveBeenCalledWith();
        expect(syncListener).toHaveBeenCalledWith();
      });
    });

    describe("default event call with extra parameters", () => {
      it("should ignore additional parameters for ROUTER_START", () => {
        const toState = {
          name: "dashboard",
          params: {},
          path: "/dashboard",
        };
        const fromState = { name: "login", params: {}, path: "/login" };
        const extraArg = { replace: true, reload: false };
        const listener = vi.fn();

        router.addEventListener(events.ROUTER_START, listener);

        router.invokeEventListeners(
          events.ROUTER_START,
          toState,
          fromState,
          extraArg,
        );

        // Listener should receive no arguments despite extra parameters
        expect(listener).toHaveBeenCalledWith();
        expect(listener.mock.calls[0]).toHaveLength(0);
      });

      it("should execute without errors despite extra parameters", () => {
        const toState = { name: "settings", params: {}, path: "/settings" };
        const fromState = { name: "account", params: {}, path: "/account" };
        const extraArg1 = "string parameter";
        const extraArg2 = 123;
        const extraArg3 = { complex: { nested: "object" } };
        const listener = vi.fn();

        router.addEventListener(events.ROUTER_START, listener);

        expect(() => {
          router.invokeEventListeners(
            events.ROUTER_START,
            toState,
            fromState,
            extraArg1,
            // @ts-expect-error - Testing invalid parameters
            extraArg2,
            extraArg3,
          );
        }).not.toThrowError();

        expect(listener).toHaveBeenCalledWith();
      });

      it("should handle RouterError as extra parameter without confusion", () => {
        const toState = { name: "help", params: {}, path: "/help" };
        const fromState = { name: "support", params: {}, path: "/support" };
        const routerError = new RouterError("IGNORED_ERROR", {
          message: "This error should be ignored",
        });
        const listener = vi.fn();

        router.addEventListener(events.ROUTER_STOP, listener);

        // RouterError as extra parameter should be ignored for default events
        router.invokeEventListeners(
          events.ROUTER_STOP,
          toState,
          fromState,
          routerError,
        );

        expect(listener).toHaveBeenCalledWith();
        expect(listener.mock.calls[0]).toHaveLength(0);
      });

      it("should handle NavigationOptions as extra parameter without processing", () => {
        const toState = { name: "contact", params: {}, path: "/contact" };
        const fromState = { name: "about", params: {}, path: "/about" };
        const navigationOptions: NavigationOptions = {
          replace: true,
          reload: false,
          force: true,
          customProperty: "should be ignored",
        };
        const listener = vi.fn();

        router.addEventListener(events.ROUTER_START, listener);

        // NavigationOptions as extra parameter should be ignored
        router.invokeEventListeners(
          events.ROUTER_START,
          toState,
          fromState,
          navigationOptions,
        );

        expect(listener).toHaveBeenCalledWith();
        expect(listener.mock.calls[0]).toHaveLength(0);
      });

      it("should maintain consistent behavior across different default events", () => {
        const extraParams = [
          { name: "state", params: {}, path: "/state" },
          { replace: true },
          "extra string",
        ];
        const startListener = vi.fn();
        const stopListener = vi.fn();

        router.addEventListener(events.ROUTER_START, startListener);
        router.addEventListener(events.ROUTER_STOP, stopListener);

        // @ts-expect-error - Testing invalid parameters
        router.invokeEventListeners(events.ROUTER_START, ...extraParams);
        // @ts-expect-error - Testing invalid parameters
        router.invokeEventListeners(events.ROUTER_STOP, ...extraParams);

        // All listeners should behave consistently
        expect(startListener).toHaveBeenCalledWith();
        expect(stopListener).toHaveBeenCalledWith();
        expect(startListener.mock.calls[0]).toHaveLength(0);
        expect(stopListener.mock.calls[0]).toHaveLength(0);
      });

      it("should not cause memory leaks with large extra parameters", () => {
        const largeObject = {
          data: Array.from({ length: 1000 })
            .fill(0)
            .map((_, i) => ({ id: i, value: `item-${i}` })),
        };
        const circularRef: any = { prop: "value" };

        circularRef.self = circularRef;

        const listener = vi.fn();

        router.addEventListener(events.ROUTER_START, listener);

        expect(() => {
          router.invokeEventListeners(
            events.ROUTER_START,
            // @ts-expect-error - Testing invalid parameters
            largeObject,
            circularRef,
          );
        }).not.toThrowError();

        expect(listener).toHaveBeenCalledWith();
        expect(listener.mock.calls[0]).toHaveLength(0);
      });

      it("should preserve error handling when extra parameters are present", () => {
        vi.spyOn(console, "error").mockImplementation(noop);

        const extraParams = ["param1", { param: 2 }, 3];

        const failingListener = vi.fn(() => {
          throw new Error("Listener error with extra params");
        });
        const workingListener = vi.fn();

        router.addEventListener(events.ROUTER_START, failingListener);
        router.addEventListener(events.ROUTER_START, workingListener);

        // @ts-expect-error - Testing invalid parameters
        router.invokeEventListeners(events.ROUTER_START, ...extraParams);

        expect(console.error).toHaveBeenCalledWith(
          "[Router] Error in listener for $start:",
          expect.any(Error),
        );
        expect(failingListener).toHaveBeenCalledWith();
        expect(workingListener).toHaveBeenCalledWith();
      });
    });
  });
});
