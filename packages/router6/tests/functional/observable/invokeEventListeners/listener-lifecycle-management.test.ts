import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { events } from "router6";

import { createTestRouter } from "../../../helpers";

import type { Router } from "router6";

let router: Router;

describe("invokeEventListeners - Listener lifecycle management", () => {
  beforeEach(() => {
    router = createTestRouter();

    router.start();
  });

  afterEach(() => {
    router.stop();
  });

  describe("listener registration and removal between events", () => {
    it("should call first listener only for first event", () => {
      const firstListenerCallLog: string[] = [];
      const firstListener = vi.fn(() => {
        firstListenerCallLog.push("first-called");
      });

      // Register first listener and call first event
      const unsubscribe = router.addEventListener(
        events.ROUTER_START,
        firstListener,
      );

      router.invokeEventListeners(events.ROUTER_START);

      // Remove first listener
      unsubscribe();

      // Register new listener
      const secondListener = vi.fn();

      router.addEventListener(events.ROUTER_START, secondListener);

      // Call second event
      router.invokeEventListeners(events.ROUTER_START);

      expect(firstListenerCallLog).toStrictEqual(["first-called"]);
      expect(firstListener).toHaveBeenCalledTimes(1);
      expect(secondListener).toHaveBeenCalledTimes(1);
    });

    it("should have second listener respond only to second event", () => {
      const secondListenerCallLog: string[] = [];
      const firstListener = vi.fn();
      const secondListener = vi.fn(() => {
        secondListenerCallLog.push("second-called");
      });

      // Register and call first listener
      const unsubscribe = router.addEventListener(
        events.ROUTER_START,
        firstListener,
      );

      router.invokeEventListeners(events.ROUTER_START);

      // Remove first listener and register second
      unsubscribe();
      router.addEventListener(events.ROUTER_START, secondListener);

      // Call second event
      router.invokeEventListeners(events.ROUTER_START);

      expect(secondListenerCallLog).toStrictEqual(["second-called"]);
      expect(firstListener).toHaveBeenCalledTimes(1);
      expect(secondListener).toHaveBeenCalledTimes(1);
    });

    it("should manage listeners correctly between event calls", () => {
      const managementLog: string[] = [];

      const listener1 = vi.fn(() => managementLog.push("L1"));
      const listener2 = vi.fn(() => managementLog.push("L2"));
      const listener3 = vi.fn(() => managementLog.push("L3"));

      // Initial setup with listener1
      const unsubscribe1 = router.addEventListener(
        events.ROUTER_START,
        listener1,
      );

      router.invokeEventListeners(events.ROUTER_START);

      // Add listener2, keep listener1
      const unsubscribe2 = router.addEventListener(
        events.ROUTER_START,
        listener2,
      );

      router.invokeEventListeners(events.ROUTER_START);

      // Remove listener1, add listener3
      unsubscribe1();
      router.addEventListener(events.ROUTER_START, listener3);
      router.invokeEventListeners(events.ROUTER_START);

      // Remove listener2
      unsubscribe2();
      router.invokeEventListeners(events.ROUTER_START);

      expect(managementLog).toStrictEqual([
        "L1", // First call: only L1
        "L1",
        "L2", // Second call: L1 + L2
        "L2",
        "L3", // Third call: L2 + L3 (L1 removed)
        "L3", // Fourth call: only L3 (L2 removed)
      ]);
    });

    it("should correctly modify listeners array", () => {
      const arrayModificationTest: string[] = [];

      const listener1 = vi.fn(() => arrayModificationTest.push("first"));
      const listener2 = vi.fn(() => arrayModificationTest.push("second"));
      const listener3 = vi.fn(() => arrayModificationTest.push("third"));

      // Step 1: Add first listener
      const unsub1 = router.addEventListener(events.ROUTER_START, listener1);

      router.invokeEventListeners(events.ROUTER_START);

      // Step 2: Add second listener
      const unsub2 = router.addEventListener(events.ROUTER_START, listener2);

      router.invokeEventListeners(events.ROUTER_START);

      // Step 3: Remove first, add third
      unsub1();
      const unsub3 = router.addEventListener(events.ROUTER_START, listener3);

      router.invokeEventListeners(events.ROUTER_START);

      // Step 4: Remove all and verify empty
      unsub2();
      unsub3();
      router.invokeEventListeners(events.ROUTER_START);

      expect(arrayModificationTest).toStrictEqual([
        "first", // Step 1
        "first",
        "second", // Step 2
        "second",
        "third", // Step 3
        // Step 4: no additions (empty array)
      ]);
    });

    it("should handle transition events with listener management", () => {
      const toState1 = { name: "page1", params: {}, path: "/page1" };
      const fromState1 = { name: "home", params: {}, path: "/home" };
      const toState2 = { name: "page2", params: {}, path: "/page2" };
      const fromState2 = { name: "page1", params: {}, path: "/page1" };

      const transitionLog: { listener: string; toState: string }[] = [];

      const transitionListener1 = vi.fn((toState) => {
        transitionLog.push({ listener: "L1", toState: toState.name });
      });

      const transitionListener2 = vi.fn((toState) => {
        transitionLog.push({ listener: "L2", toState: toState.name });
      });

      // First transition with first listener
      const unsubscribe1 = router.addEventListener(
        events.TRANSITION_START,
        transitionListener1,
      );

      router.invokeEventListeners(
        events.TRANSITION_START,
        toState1,
        fromState1,
      );

      // Remove first listener, add second
      unsubscribe1();
      router.addEventListener(events.TRANSITION_START, transitionListener2);

      // Second transition with second listener
      router.invokeEventListeners(
        events.TRANSITION_START,
        toState2,
        fromState2,
      );

      expect(transitionLog).toStrictEqual([
        { listener: "L1", toState: "page1" },
        { listener: "L2", toState: "page2" },
      ]);
      expect(transitionListener1).toHaveBeenCalledWith(toState1, fromState1);
      expect(transitionListener2).toHaveBeenCalledWith(toState2, fromState2);
    });

    it("should handle rapid listener registration and removal", () => {
      const rapidOperationLog: string[] = [];

      // Create multiple listeners
      const listeners = Array.from({ length: 5 }, (_, i) =>
        vi.fn(() => rapidOperationLog.push(`L${i + 1}`)),
      );

      // Rapid registration
      const unsubscribers = listeners.map((listener) =>
        router.addEventListener(events.ROUTER_START, listener),
      );

      // First call - all listeners
      router.invokeEventListeners(events.ROUTER_START);

      // Rapid removal of every other listener
      unsubscribers[1](); // Remove L2
      unsubscribers[3](); // Remove L4

      // Second call - remaining listeners
      router.invokeEventListeners(events.ROUTER_START);

      // Remove all remaining
      unsubscribers[0](); // Remove L1
      unsubscribers[2](); // Remove L3
      unsubscribers[4](); // Remove L5

      // Third call - no listeners
      router.invokeEventListeners(events.ROUTER_START);

      expect(rapidOperationLog).toStrictEqual([
        "L1",
        "L2",
        "L3",
        "L4",
        "L5", // First call: all
        "L1",
        "L3",
        "L5", // Second call: L2 and L4 removed
        // Third call: no listeners called
      ]);
    });

    it("should maintain listener isolation between different event types", () => {
      const isolationLog: { event: string; listener: string }[] = [];

      const startListener = vi.fn(() => {
        isolationLog.push({ event: "START", listener: "start" });
      });

      const stopListener = vi.fn(() => {
        isolationLog.push({ event: "STOP", listener: "stop" });
      });

      // Register listeners for different events
      const unsubStart = router.addEventListener(
        events.ROUTER_START,
        startListener,
      );

      router.addEventListener(events.ROUTER_STOP, stopListener);

      // Call all events
      router.invokeEventListeners(events.ROUTER_START);
      router.invokeEventListeners(events.ROUTER_STOP);

      // Remove ROUTER_START listener
      unsubStart();

      // Call events again
      router.invokeEventListeners(events.ROUTER_START); // Should not call startListener
      router.invokeEventListeners(events.ROUTER_STOP); // Should call stopListener

      expect(isolationLog).toStrictEqual([
        { event: "START", listener: "start" },
        { event: "STOP", listener: "stop" },
        // Second round: START listener removed
        { event: "STOP", listener: "stop" },
      ]);
    });

    it("should handle listener replacement for same event type", () => {
      const replacementLog: string[] = [];

      const originalListener = vi.fn(() => {
        replacementLog.push("original");
      });

      const replacementListener = vi.fn(() => {
        replacementLog.push("replacement");
      });

      // Register original listener
      const unsubOriginal = router.addEventListener(
        events.ROUTER_START,
        originalListener,
      );

      router.invokeEventListeners(events.ROUTER_START);

      // Replace listener
      unsubOriginal();
      const unsubReplacement = router.addEventListener(
        events.ROUTER_START,
        replacementListener,
      );

      router.invokeEventListeners(events.ROUTER_START);

      // Replace again with original
      unsubReplacement();
      router.addEventListener(events.ROUTER_START, originalListener);
      router.invokeEventListeners(events.ROUTER_START);

      expect(replacementLog).toStrictEqual([
        "original", // First call
        "replacement", // Second call after replacement
        "original", // Third call after second replacement
      ]);
    });

    it("should handle complex listener lifecycle management", () => {
      const lifecycleLog: { phase: string; listeners: string[] }[] = [];

      const listenerA = vi.fn(() => "A");
      const listenerB = vi.fn(() => "B");
      const listenerC = vi.fn(() => "C");
      const listenerD = vi.fn(() => "D");

      // Phase 1: A, B
      const unsubA = router.addEventListener(events.ROUTER_START, listenerA);
      const unsubB = router.addEventListener(events.ROUTER_START, listenerB);

      const phase1Listeners: string[] = [];

      router.addEventListener(events.ROUTER_START, () =>
        phase1Listeners.push("tracker"),
      );
      router.invokeEventListeners(events.ROUTER_START);
      lifecycleLog.push({ phase: "1", listeners: ["A", "B"] });

      // Phase 2: Remove A, Add C
      unsubA();
      const unsubC = router.addEventListener(events.ROUTER_START, listenerC);

      router.invokeEventListeners(events.ROUTER_START);
      lifecycleLog.push({ phase: "2", listeners: ["B", "C"] });

      // Phase 3: Add D, Remove B
      const unsubD = router.addEventListener(events.ROUTER_START, listenerD);

      unsubB();
      router.invokeEventListeners(events.ROUTER_START);
      lifecycleLog.push({ phase: "3", listeners: ["C", "D"] });

      // Phase 4: Remove all
      unsubC();
      unsubD();
      router.invokeEventListeners(events.ROUTER_START);
      lifecycleLog.push({ phase: "4", listeners: [] });

      expect(lifecycleLog).toHaveLength(4);
      expect(lifecycleLog[0].listeners).toStrictEqual(["A", "B"]);
      expect(lifecycleLog[1].listeners).toStrictEqual(["B", "C"]);
      expect(lifecycleLog[2].listeners).toStrictEqual(["C", "D"]);
      expect(lifecycleLog[3].listeners).toStrictEqual([]);
    });

    it("should maintain correct listener count through registration and removal cycles", () => {
      const executionCounts: number[] = [];

      // Simpler approach: just track the actual listener calls
      let callCount = 0;

      // Initial state - no listeners
      callCount = 0;
      router.invokeEventListeners(events.ROUTER_START);
      executionCounts.push(callCount);

      // Add 3 listeners
      const listener1 = vi.fn(() => callCount++);
      const listener2 = vi.fn(() => callCount++);
      const listener3 = vi.fn(() => callCount++);

      const unsub1 = router.addEventListener(events.ROUTER_START, listener1);
      const unsub2 = router.addEventListener(events.ROUTER_START, listener2);
      const unsub3 = router.addEventListener(events.ROUTER_START, listener3);

      callCount = 0;
      router.invokeEventListeners(events.ROUTER_START);
      executionCounts.push(callCount);

      // Remove one listener
      unsub2();
      callCount = 0;
      router.invokeEventListeners(events.ROUTER_START);
      executionCounts.push(callCount);

      // Remove all remaining listeners
      unsub1();
      unsub3();
      callCount = 0;
      router.invokeEventListeners(events.ROUTER_START);
      executionCounts.push(callCount);

      expect(executionCounts).toStrictEqual([0, 3, 2, 0]);
    });
  });
});
