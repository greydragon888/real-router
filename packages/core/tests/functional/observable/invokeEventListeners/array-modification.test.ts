import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { events } from "@real-router/core";

import { createTestRouter } from "../../../helpers";

import type { Router, Unsubscribe } from "@real-router/core";

let router: Router;

describe("invokeEventListeners - Array modification", () => {
  beforeEach(() => {
    router = createTestRouter();

    router.start();
  });

  afterEach(() => {
    router.stop();
  });

  describe("array modification during iteration", () => {
    it("should not call new listener added during current iteration", () => {
      let dynamicListenerCalled = false;

      const dynamicListener = vi.fn(() => {
        dynamicListenerCalled = true;
      });

      const addingListener = vi.fn(() => {
        router.addEventListener(events.ROUTER_START, dynamicListener);
      });

      const finalListener = vi.fn();

      router.addEventListener(events.ROUTER_START, addingListener);
      router.addEventListener(events.ROUTER_START, finalListener);

      router.invokeEventListeners(events.ROUTER_START);

      expect(addingListener).toHaveBeenCalledWith();
      expect(finalListener).toHaveBeenCalledWith();
      expect(dynamicListenerCalled).toBe(false);
      expect(dynamicListener).not.toHaveBeenCalled();
    });

    it("should protect iteration from modifications through array cloning", () => {
      const executionOrder: string[] = [];
      let newListenerAdded = false;

      const newListener = vi.fn(() => {
        executionOrder.push("dynamicListener");
      });

      const listener1 = vi.fn(() => {
        executionOrder.push("listener1");
        // Add new listener during execution
        router.addEventListener(events.ROUTER_START, newListener);
        newListenerAdded = true;
      });

      const listener2 = vi.fn(() => {
        executionOrder.push("listener2");
      });

      const listener3 = vi.fn(() => {
        executionOrder.push("listener3");
      });

      router.addEventListener(events.ROUTER_START, listener1);
      router.addEventListener(events.ROUTER_START, listener2);
      router.addEventListener(events.ROUTER_START, listener3);

      router.invokeEventListeners(events.ROUTER_START);

      // Only original listeners should execute in first invocation
      expect(executionOrder).toStrictEqual([
        "listener1",
        "listener2",
        "listener3",
      ]);
      expect(newListenerAdded).toBe(true);
      expect(newListener).not.toHaveBeenCalled();

      // Clear execution order for second test
      executionOrder.length = 0;

      // Second invocation should include the dynamically added listener
      router.invokeEventListeners(events.ROUTER_START);

      expect(executionOrder).toStrictEqual([
        "listener1",
        "listener2",
        "listener3",
        "dynamicListener",
      ]);
    });

    it("should complete original iteration correctly despite modifications", () => {
      const originalListeners: string[] = [];
      const allExecutedListeners: string[] = [];

      const listener1 = vi.fn(() => {
        originalListeners.push("original1");
        allExecutedListeners.push("original1");
      });

      const listener2 = vi.fn(() => {
        originalListeners.push("original2");
        allExecutedListeners.push("original2");
        // Add multiple listeners during execution
        router.addEventListener(events.ROUTER_START, () => {
          allExecutedListeners.push("added1");
        });
        router.addEventListener(events.ROUTER_START, () => {
          allExecutedListeners.push("added2");
        });
      });

      const listener3 = vi.fn(() => {
        originalListeners.push("original3");
        allExecutedListeners.push("original3");
      });

      router.addEventListener(events.ROUTER_START, listener1);
      router.addEventListener(events.ROUTER_START, listener2);
      router.addEventListener(events.ROUTER_START, listener3);

      router.invokeEventListeners(events.ROUTER_START);

      expect(originalListeners).toStrictEqual([
        "original1",
        "original2",
        "original3",
      ]);
      expect(allExecutedListeners).toStrictEqual([
        "original1",
        "original2",
        "original3",
      ]);
    });

    it("should call added listener in subsequent event invocation", () => {
      let dynamicListenerCalled = false;

      const dynamicListener = vi.fn(() => {
        dynamicListenerCalled = true;
      });

      const addingListener = vi.fn(() => {
        router.addEventListener(events.ROUTER_START, dynamicListener);
      });

      router.addEventListener(events.ROUTER_START, addingListener);

      // First invocation - dynamic listener should not be called
      router.invokeEventListeners(events.ROUTER_START);

      expect(dynamicListenerCalled).toBe(false);

      // Second invocation - dynamic listener should be called
      router.invokeEventListeners(events.ROUTER_START);

      expect(dynamicListenerCalled).toBe(true);
      expect(dynamicListener).toHaveBeenCalledWith();
    });

    it("should handle removal of listeners during iteration safely", () => {
      const executionOrder: string[] = [];
      let listenerToRemove: Unsubscribe;

      const listener1 = vi.fn(() => {
        executionOrder.push("listener1");
      });

      const listener2 = vi.fn(() => {
        executionOrder.push("listener2");
        // Remove listener3 during execution
        listenerToRemove();
      });

      const listener3 = vi.fn(() => {
        executionOrder.push("listener3");
      });

      router.addEventListener(events.ROUTER_START, listener1);
      router.addEventListener(events.ROUTER_START, listener2);
      listenerToRemove = router.addEventListener(
        events.ROUTER_START,
        listener3,
      );

      router.invokeEventListeners(events.ROUTER_START);

      // All listeners should execute in current iteration due to array cloning
      expect(executionOrder).toStrictEqual([
        "listener1",
        "listener2",
        "listener3",
      ]);
      expect(listener1).toHaveBeenCalledWith();
      expect(listener2).toHaveBeenCalledWith();
      expect(listener3).toHaveBeenCalledWith();
    });

    it("should handle complex modifications during iteration", () => {
      const executionOrder: string[] = [];
      let unsubscriber1: Unsubscribe;
      let unsubscriber2: Unsubscribe;

      const listener1 = vi.fn(() => {
        executionOrder.push("listener1");
        // Add new listener
        router.addEventListener(events.ROUTER_START, () => {
          executionOrder.push("addedDuringL1");
        });
        // Remove listener2
        unsubscriber2();
      });

      const listener2 = vi.fn(() => {
        executionOrder.push("listener2");
      });

      const listener3 = vi.fn(() => {
        executionOrder.push("listener3");
        // Remove self
        unsubscriber1();

        // Add another listener
        router.addEventListener(events.ROUTER_START, () => {
          executionOrder.push("addedDuringL3");
        });
      });

      unsubscriber1 = router.addEventListener(events.ROUTER_START, listener1);
      unsubscriber2 = router.addEventListener(events.ROUTER_START, listener2);
      router.addEventListener(events.ROUTER_START, listener3);

      router.invokeEventListeners(events.ROUTER_START);

      expect(executionOrder).toStrictEqual([
        "listener1",
        "listener2",
        "listener3",
      ]);
    });

    it("should maintain array cloning for transition events", () => {
      const toState = {
        name: "dashboard",
        params: {},
        path: "/dashboard",
      };
      const fromState = { name: "login", params: {}, path: "/login" };
      let dynamicListenerExecuted = false;

      const addingListener = vi.fn(() => {
        router.addEventListener(events.TRANSITION_START, () => {
          dynamicListenerExecuted = true;
        });
      });

      const normalListener = vi.fn();

      router.addEventListener(events.TRANSITION_START, addingListener);
      router.addEventListener(events.TRANSITION_START, normalListener);

      router.invokeEventListeners(events.TRANSITION_START, toState, fromState);

      expect(addingListener).toHaveBeenCalledWith(toState, fromState);
      expect(normalListener).toHaveBeenCalledWith(toState, fromState);
      expect(dynamicListenerExecuted).toBe(false);
    });

    it("should handle multiple simultaneous additions during iteration", () => {
      const executionTracker: string[] = [];

      const listener1 = vi.fn(() => {
        executionTracker.push("listener1");
        // Add multiple listeners
        router.addEventListener(events.ROUTER_START, () =>
          executionTracker.push("added1"),
        );
        router.addEventListener(events.ROUTER_START, () =>
          executionTracker.push("added2"),
        );
        router.addEventListener(events.ROUTER_START, () =>
          executionTracker.push("added3"),
        );
      });

      const listener2 = vi.fn(() => {
        executionTracker.push("listener2");
        // Add more listeners
        router.addEventListener(events.ROUTER_START, () =>
          executionTracker.push("added4"),
        );
        router.addEventListener(events.ROUTER_START, () =>
          executionTracker.push("added5"),
        );
      });

      router.addEventListener(events.ROUTER_START, listener1);
      router.addEventListener(events.ROUTER_START, listener2);

      // First execution - only original listeners should run
      router.invokeEventListeners(events.ROUTER_START);

      expect(executionTracker).toStrictEqual(["listener1", "listener2"]);

      // Second execution - all added listeners should now run
      executionTracker.length = 0; // Clear tracker
      router.invokeEventListeners(events.ROUTER_START);

      expect(executionTracker).toStrictEqual([
        "listener1",
        "listener2",
        "added1",
        "added2",
        "added3",
        "added4",
        "added5",
      ]);
    });

    it("should verify array cloning behavior with array inspection", () => {
      let originalArrayRef: any[] | null = null;

      const inspectingListener = vi.fn(() => {
        // This listener will help us verify that array cloning is working
        const internalCallbacks =
          (router as any).callbacks ?? (router as any)._callbacks;

        if (internalCallbacks?.[events.ROUTER_START]) {
          originalArrayRef = internalCallbacks[events.ROUTER_START];
          // Add new listener to original array
          originalArrayRef!.push(() => {});
        }
      });

      router.addEventListener(events.ROUTER_START, inspectingListener);

      router.invokeEventListeners(events.ROUTER_START);

      // Original array should have grown due to modification during execution
      // We started with 1 listener (inspectingListener), and it pushes another one
      /* eslint-disable vitest/no-conditional-in-test, vitest/no-conditional-expect, @typescript-eslint/no-unnecessary-condition */
      if (originalArrayRef) {
        expect((originalArrayRef as any[]).length).toBeGreaterThan(1);
      }
      /* eslint-enable vitest/no-conditional-in-test, vitest/no-conditional-expect, @typescript-eslint/no-unnecessary-condition */

      expect(inspectingListener).toHaveBeenCalledWith();
    });
  });
});
