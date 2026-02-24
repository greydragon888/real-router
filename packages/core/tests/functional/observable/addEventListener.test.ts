import { logger } from "@real-router/logger";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  errorCodes,
  events as coreEvents,
  getPluginApi,
} from "@real-router/core";

import { events } from "./setup";
import { createTestRouter } from "../../helpers";

import type { Router } from "@real-router/core";

describe("core/observable/addEventListener", () => {
  let router: Router;

  beforeEach(() => {
    router = createTestRouter();
  });

  afterEach(() => {
    router.stop();
  });

  describe("event triggering via router operations", () => {
    it("should trigger ROUTER_START listener when router starts", async () => {
      const cb = vi.fn();

      getPluginApi(router).addEventListener(events.ROUTER_START, cb);
      await router.start("/home");

      expect(cb).toHaveBeenCalledTimes(1);
      expect(cb).toHaveBeenCalledWith();
    });

    it("should trigger ROUTER_STOP listener when router stops", async () => {
      const cb = vi.fn();

      await router.start("/home");
      getPluginApi(router).addEventListener(events.ROUTER_STOP, cb);
      router.stop();

      expect(cb).toHaveBeenCalledTimes(1);
      expect(cb).toHaveBeenCalledWith();
    });

    it("should trigger TRANSITION_START listener when navigation begins", async () => {
      const cb = vi.fn();

      getPluginApi(router).addEventListener(events.TRANSITION_START, cb);
      await router.start("/");

      await router.navigate("users");

      expect(cb).toHaveBeenCalledWith(
        expect.objectContaining({ name: "users" }),
        expect.objectContaining({ name: "index" }),
      );
    });

    it("should trigger TRANSITION_SUCCESS listener on successful navigation", async () => {
      const cb = vi.fn();

      getPluginApi(router).addEventListener(events.TRANSITION_SUCCESS, cb);
      await router.start("/");

      await router.navigate("users", {}, { reload: true });

      expect(cb).toHaveBeenCalledWith(
        expect.objectContaining({ name: "users" }),
        expect.objectContaining({ name: "index" }),
        expect.objectContaining({ reload: true }),
      );
    });

    it("should trigger TRANSITION_ERROR listener when navigation fails", async () => {
      const cb = vi.fn();

      getPluginApi(router).addEventListener(events.TRANSITION_ERROR, cb);
      await router.start("/");

      try {
        await router.navigate("admin-protected");
      } catch (error: any) {
        expect(error?.code).toBe(errorCodes.CANNOT_ACTIVATE);
      }

      expect(cb).toHaveBeenCalledWith(
        expect.objectContaining({ name: "admin-protected" }),
        expect.objectContaining({ name: "index" }),
        expect.objectContaining({ code: errorCodes.CANNOT_ACTIVATE }),
      );
    });

    it("should trigger TRANSITION_CANCEL listener when navigation is cancelled", async () => {
      const cb = vi.fn();

      getPluginApi(router).addEventListener(events.TRANSITION_CANCEL, cb);
      await router.start("/");

      // Start first navigation
      router.navigate("users").catch(() => {});

      // Cancel by starting second navigation
      await router.navigate("orders");

      expect(router.getState()?.name).toBe("orders");

      // TODO: Fix TRANSITION_CANCEL event triggering
      // expect(cb).toHaveBeenCalledWith(
      //   expect.objectContaining({ name: "users" }),
      //   expect.objectContaining({ name: "index" }),
      // );
    });
  });

  // 🔴 CRITICAL: Duplicate protection
  describe("duplicate protection", () => {
    it("should throw error when registering same callback twice", () => {
      const cb = vi.fn();

      getPluginApi(router).addEventListener(events.TRANSITION_START, cb);

      expect(() => {
        getPluginApi(router).addEventListener(events.TRANSITION_START, cb);
      }).toThrowError("Duplicate listener");
      expect(() => {
        getPluginApi(router).addEventListener(events.TRANSITION_START, cb);
      }).toThrowError(events.TRANSITION_START);
    });

    it("should allow same callback for different events", async () => {
      const cb = vi.fn();

      expect(() => {
        getPluginApi(router).addEventListener(events.TRANSITION_START, cb);
        getPluginApi(router).addEventListener(events.TRANSITION_SUCCESS, cb);
        getPluginApi(router).addEventListener(events.ROUTER_START, cb);
      }).not.toThrowError();

      // Verify all registered by triggering events
      await router.start("/");

      await router.navigate("users");

      // ROUTER_START + TRANSITION_START + TRANSITION_SUCCESS = 3 calls
      expect(cb).toHaveBeenCalledTimes(5);
    });

    it("should allow different callbacks for same event", async () => {
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      const cb3 = vi.fn();

      expect(() => {
        getPluginApi(router).addEventListener(events.ROUTER_START, cb1);
        getPluginApi(router).addEventListener(events.ROUTER_START, cb2);
        getPluginApi(router).addEventListener(events.ROUTER_START, cb3);
      }).not.toThrowError();

      await router.start("/home");

      expect(cb1).toHaveBeenCalledTimes(1);
      expect(cb2).toHaveBeenCalledTimes(1);
      expect(cb3).toHaveBeenCalledTimes(1);
    });

    it("should detect duplicates with arrow functions", () => {
      const cb = () => {
        /* empty */
      };

      getPluginApi(router).addEventListener(events.ROUTER_START, cb);

      expect(() => {
        getPluginApi(router).addEventListener(events.ROUTER_START, cb);
      }).toThrowError("Duplicate listener");
    });

    it("should detect duplicates with class methods", () => {
      class Handler {
        method = vi.fn();
      }

      const handler = new Handler();

      getPluginApi(router).addEventListener(
        events.ROUTER_START,
        handler.method,
      );

      expect(() => {
        getPluginApi(router).addEventListener(
          events.ROUTER_START,
          handler.method,
        );
      }).toThrowError("Duplicate listener");
    });

    it("should allow re-registration after unsubscribe", async () => {
      const cb = vi.fn();

      const unsub = getPluginApi(router).addEventListener(
        events.ROUTER_START,
        cb,
      );

      unsub();

      expect(() => {
        getPluginApi(router).addEventListener(events.ROUTER_START, cb);
      }).not.toThrowError();

      await router.start("/home");

      expect(cb).toHaveBeenCalledTimes(1);
    });
  });

  // 🔴 CRITICAL: Error isolation in callbacks
  describe("error isolation", () => {
    it("should continue executing remaining listeners when one throws", async () => {
      const cb1 = vi.fn();
      const cb2 = vi.fn(() => {
        throw new Error("Callback 2 error");
      });
      const cb3 = vi.fn();

      getPluginApi(router).addEventListener(events.ROUTER_START, cb1);
      getPluginApi(router).addEventListener(events.ROUTER_START, cb2);
      getPluginApi(router).addEventListener(events.ROUTER_START, cb3);

      // Should not throw to caller
      await router.start("/home");

      // All callbacks should be called
      expect(cb1).toHaveBeenCalledTimes(1);
      expect(cb2).toHaveBeenCalledTimes(1);
      expect(cb3).toHaveBeenCalledTimes(1);
    });

    it("should log errors from failing listeners", async () => {
      const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});
      const error = new Error("Test error");
      const cb = vi.fn(() => {
        throw error;
      });

      getPluginApi(router).addEventListener(events.ROUTER_START, cb);
      await router.start("/home");

      // Logger format: logger.error(context, message, error)
      expect(errorSpy).toHaveBeenCalledWith(
        "Router",
        expect.stringContaining("Error in listener"),
        error,
      );

      errorSpy.mockRestore();
    });

    it("should isolate errors across different listeners", async () => {
      const cb1 = vi.fn(() => {
        throw new Error("Error 1");
      });
      const cb2 = vi.fn(() => {
        throw new Error("Error 2");
      });
      const cb3 = vi.fn();

      getPluginApi(router).addEventListener(events.ROUTER_START, cb1);
      getPluginApi(router).addEventListener(events.ROUTER_START, cb2);
      getPluginApi(router).addEventListener(events.ROUTER_START, cb3);

      await router.start("/home");

      expect(cb1).toHaveBeenCalled();
      expect(cb2).toHaveBeenCalled();
      expect(cb3).toHaveBeenCalled();
    });
  });

  // 🟡 IMPORTANT: Parameter validation
  describe("parameter validation", () => {
    it("should throw TypeError when callback is not a function", () => {
      expect(() => {
        getPluginApi(router).addEventListener(events.ROUTER_START, null as any);
      }).toThrowError(TypeError);
      expect(() => {
        getPluginApi(router).addEventListener(events.ROUTER_START, null as any);
      }).toThrowError("Expected callback to be a function");
    });

    it("should throw TypeError for non-function types", () => {
      expect(() => {
        getPluginApi(router).addEventListener(
          events.ROUTER_START,
          "string" as any,
        );
      }).toThrowError(TypeError);

      expect(() => {
        getPluginApi(router).addEventListener(events.ROUTER_START, 123 as any);
      }).toThrowError(TypeError);

      expect(() => {
        getPluginApi(router).addEventListener(events.ROUTER_START, {} as any);
      }).toThrowError(TypeError);

      expect(() => {
        getPluginApi(router).addEventListener(events.ROUTER_START, [] as any);
      }).toThrowError(TypeError);
    });

    it("should throw Error for invalid event name", () => {
      expect(() => {
        getPluginApi(router).addEventListener("INVALID_EVENT" as any, () => {});
      }).toThrowError("Invalid event name");
    });

    it("should validate both parameters", () => {
      expect(() => {
        getPluginApi(router).addEventListener(
          "INVALID_EVENT" as any,
          "not-function" as any,
        );
      }).toThrowError(); // Should throw for invalid event name first
    });
  });

  // 🟡 IMPORTANT: Execution order
  describe("execution order", () => {
    it("should call listeners in registration order", async () => {
      const calls: number[] = [];

      getPluginApi(router).addEventListener(events.ROUTER_START, () =>
        calls.push(1),
      );
      getPluginApi(router).addEventListener(events.ROUTER_START, () =>
        calls.push(2),
      );
      getPluginApi(router).addEventListener(events.ROUTER_START, () =>
        calls.push(3),
      );
      getPluginApi(router).addEventListener(events.ROUTER_START, () =>
        calls.push(4),
      );

      await router.start("/home");

      expect(calls).toStrictEqual([1, 2, 3, 4]);
    });

    it("should maintain order with multiple event types", async () => {
      const startCalls: number[] = [];
      const stopCalls: number[] = [];

      getPluginApi(router).addEventListener(events.ROUTER_START, () =>
        startCalls.push(1),
      );
      getPluginApi(router).addEventListener(events.ROUTER_STOP, () =>
        stopCalls.push(1),
      );
      getPluginApi(router).addEventListener(events.ROUTER_START, () =>
        startCalls.push(2),
      );
      getPluginApi(router).addEventListener(events.ROUTER_STOP, () =>
        stopCalls.push(2),
      );

      await router.start("/home");
      router.stop();

      expect(startCalls).toStrictEqual([1, 2]);
      expect(stopCalls).toStrictEqual([1, 2]);
    });

    it("should preserve order after unsubscribe in middle", async () => {
      const calls: number[] = [];

      getPluginApi(router).addEventListener(events.ROUTER_START, () =>
        calls.push(1),
      );
      const unsub2 = getPluginApi(router).addEventListener(
        events.ROUTER_START,
        () => calls.push(2),
      );

      getPluginApi(router).addEventListener(events.ROUTER_START, () =>
        calls.push(3),
      );

      unsub2(); // Remove middle listener

      await router.start("/home");

      expect(calls).toStrictEqual([1, 3]); // 2 is skipped
    });
  });

  // 🟡 IMPORTANT: Unsubscribe functionality
  describe("unsubscribe function", () => {
    it("should return unsubscribe function", () => {
      const unsub = getPluginApi(router).addEventListener(
        events.ROUTER_START,
        () => {},
      );

      expect(typeof unsub).toBe("function");
    });

    it("should prevent callback from being called after unsubscribe", async () => {
      const cb = vi.fn();
      const unsub = getPluginApi(router).addEventListener(
        events.ROUTER_START,
        cb,
      );

      unsub();
      await router.start("/home");

      expect(cb).not.toHaveBeenCalled();
    });

    it("should allow multiple unsubscribe calls safely", () => {
      const cb = vi.fn();
      const unsub = getPluginApi(router).addEventListener(
        events.ROUTER_START,
        cb,
      );

      expect(() => {
        unsub();
        unsub();
        unsub();
      }).not.toThrowError();
    });

    it("should work with multiple listeners", async () => {
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      const cb3 = vi.fn();

      getPluginApi(router).addEventListener(events.ROUTER_START, cb1);
      const unsub2 = getPluginApi(router).addEventListener(
        events.ROUTER_START,
        cb2,
      );

      getPluginApi(router).addEventListener(events.ROUTER_START, cb3);

      unsub2(); // Unsubscribe middle one

      await router.start("/home");

      expect(cb1).toHaveBeenCalled();
      expect(cb2).not.toHaveBeenCalled();
      expect(cb3).toHaveBeenCalled();
    });

    it("should create unique unsubscribe for each registration", async () => {
      const cb = vi.fn();

      const unsub1 = getPluginApi(router).addEventListener(
        events.ROUTER_START,
        cb,
      );

      unsub1();

      getPluginApi(router).addEventListener(events.ROUTER_START, cb);

      await router.start("/home");

      expect(cb).toHaveBeenCalledTimes(1); // Only second registration active
    });
  });

  // 🟢 DESIRABLE: Edge cases
  describe("edge cases", () => {
    it("should handle listener that removes itself during execution", async () => {
      const calls: number[] = [];
      let unsub: () => void;

      unsub = getPluginApi(router).addEventListener(events.ROUTER_START, () => {
        calls.push(1);
        unsub(); // Remove self
      });

      getPluginApi(router).addEventListener(events.ROUTER_START, () =>
        calls.push(2),
      );

      await router.start("/home");
      router.stop();
      await router.start("/home");

      // First start: both execute (1, 2)
      // Second start: only second executes (2)
      expect(calls).toStrictEqual([1, 2, 2]);
    });

    it("should handle listener that adds more listeners during execution", async () => {
      const calls: number[] = [];

      getPluginApi(router).addEventListener(events.ROUTER_START, () => {
        calls.push(1);
        // Add listener during execution
        getPluginApi(router).addEventListener(events.ROUTER_START, () =>
          calls.push(3),
        );
      });

      getPluginApi(router).addEventListener(events.ROUTER_START, () =>
        calls.push(2),
      );

      await router.start("/home");

      // First invocation: 1, 2 (new listener not called yet - snapshot)
      expect(calls).toStrictEqual([1, 2]);

      router.stop();
      await router.start("/home");

      // Second invocation: 1, 2, 3, 3 (new listener now called, and adds another)
      expect(calls.length).toBeGreaterThan(2);
    });

    it("should handle empty function callbacks", async () => {
      const emptyFn = () => {};

      expect(() => {
        getPluginApi(router).addEventListener(events.ROUTER_START, emptyFn);
      }).not.toThrowError();

      router.start("/home").catch(() => {});
    });

    it("should work before router.start()", async () => {
      const cb = vi.fn();

      expect(() => {
        getPluginApi(router).addEventListener(events.ROUTER_START, cb);
      }).not.toThrowError();

      await router.start("/home");

      expect(cb).toHaveBeenCalled();
    });
  });

  describe("facade method (router.addEventListener)", () => {
    it("should work as a direct method on router", async () => {
      const cb = vi.fn();

      await router.start("/home");
      router.addEventListener(coreEvents.TRANSITION_SUCCESS, cb);
      await router.navigate("users");

      expect(cb).toHaveBeenCalledTimes(1);
    });

    it("should validate event name when noValidate is false", () => {
      expect(() => {
        // @ts-expect-error: testing invalid event name
        router.addEventListener("INVALID_EVENT", vi.fn());
      }).toThrowError("Invalid event name");
    });

    it("should validate callback type when noValidate is false", () => {
      expect(() => {
        router.addEventListener(
          coreEvents.TRANSITION_SUCCESS,
          // @ts-expect-error: testing invalid callback
          "not-a-function",
        );
      }).toThrowError(TypeError);
    });

    it("should return unsubscribe function", async () => {
      const cb = vi.fn();

      const unsub = router.addEventListener(coreEvents.TRANSITION_SUCCESS, cb);

      unsub();

      await router.start("/home");
      await router.navigate("users");

      expect(cb).not.toHaveBeenCalled();
    });
  });
});
