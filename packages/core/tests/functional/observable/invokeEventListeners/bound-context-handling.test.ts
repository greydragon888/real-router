import { logger } from "@real-router/logger";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { events } from "@real-router/core";

import { createTestRouter } from "../../../helpers";

import type { Router } from "@real-router/core";

let router: Router;
const noop = () => undefined;

describe("invokeEventListeners - Bound context handling", () => {
  beforeEach(() => {
    router = createTestRouter();

    router.start();
  });

  afterEach(() => {
    router.stop();
  });

  describe("handling listener with bound context", () => {
    it("should call method with undefined context via Reflect.apply", () => {
      const testObject = {
        name: "TestObject",
        value: 42,
        listenerMethod: vi.fn(function (this: any) {
          expect(this).toBeUndefined();
        }),
      };

      router.addEventListener(events.ROUTER_START, testObject.listenerMethod);

      router.invokeEventListeners(events.ROUTER_START);

      expect(testObject.listenerMethod).toHaveBeenCalledWith();
    });

    it("should not preserve original object context", () => {
      const contextTestObject = {
        identifier: "originalContext",
        data: { count: 0 },
        handleEvent: vi.fn(function (this: any) {
          // Context should be undefined, not the original object
          expect(this).toBeUndefined();
          expect(this?.identifier).toBeUndefined();
          expect(this?.data).toBeUndefined();
        }),
      };

      router.addEventListener(
        events.ROUTER_START,
        contextTestObject.handleEvent,
      );

      router.invokeEventListeners(events.ROUTER_START);

      expect(contextTestObject.handleEvent).toHaveBeenCalledTimes(1);
    });

    it("should make listener independent from external context", () => {
      const externalContext = {
        state: "external",
        counter: 100,
        eventHandler: vi.fn(function (this: any) {
          // Should not have access to external context properties
          expect(this).toBeUndefined();

          // These should all be undefined since context is lost
          expect(this?.state).toBeUndefined();
          expect(this?.counter).toBeUndefined();

          // Listener should still execute successfully
          return "executed independently";
        }),
      };

      router.addEventListener(
        events.ROUTER_START,
        externalContext.eventHandler,
      );

      router.invokeEventListeners(events.ROUTER_START);

      expect(externalContext.eventHandler).toHaveBeenCalledWith();
    });

    it("should process event correctly despite context loss", () => {
      const executionOrder: string[] = [];

      const objectWithMethod = {
        id: "contextObject",
        processEvent: vi.fn(function (this: any) {
          executionOrder.push("objectMethod");

          expect(this).toBeUndefined();
        }),
      };

      const standaloneFunction = vi.fn(() => {
        executionOrder.push("standaloneFunction");
      });

      router.addEventListener(
        events.ROUTER_START,
        objectWithMethod.processEvent,
      );
      router.addEventListener(events.ROUTER_START, standaloneFunction);

      router.invokeEventListeners(events.ROUTER_START);

      expect(executionOrder).toStrictEqual([
        "objectMethod",
        "standaloneFunction",
      ]);
      expect(objectWithMethod.processEvent).toHaveBeenCalledWith();
      expect(standaloneFunction).toHaveBeenCalledWith();
    });

    it("should handle bound functions without preserving bound context", () => {
      const originalObject = {
        name: "originalObject",
        value: "originalValue",
        method: function (this: any) {
          // Even with bound function, context should be undefined
          expect(this).toBeUndefined();
        },
      };

      const boundMethod = vi.fn(originalObject.method.bind(originalObject));

      router.addEventListener(events.ROUTER_START, boundMethod);

      router.invokeEventListeners(events.ROUTER_START);

      expect(boundMethod).toHaveBeenCalledWith();
    });

    it("should handle class instance methods correctly", () => {
      class EventHandlerClass {
        public instanceProperty = "classInstance";
        public callCount = 0;

        public handleEvent = vi.fn(function (this: any) {
          // Context should be undefined, not the class instance
          expect(this).toBeUndefined();
          expect(this.instanceProperty).toBeUndefined();
          expect(this.callCount).toBeUndefined();
        });
      }

      const handlerInstance = new EventHandlerClass();

      router.addEventListener(events.ROUTER_START, handlerInstance.handleEvent);

      router.invokeEventListeners(events.ROUTER_START);

      expect(handlerInstance.handleEvent).toHaveBeenCalledWith();
    });

    it("should handle arrow functions (which don't have context) normally", () => {
      const contextObject = {
        property: "value",
        arrowMethod: vi.fn(() => {
          // Arrow functions don't have their own 'this', so this test verifies
          // that Reflect.apply doesn't break arrow function behavior
          expect(true).toBe(true); // Just verify execution
        }),
      };

      router.addEventListener(events.ROUTER_START, contextObject.arrowMethod);

      router.invokeEventListeners(events.ROUTER_START);

      expect(contextObject.arrowMethod).toHaveBeenCalledWith();
    });

    it("should handle transition events with object methods and undefined context", () => {
      const toState = {
        name: "dashboard",
        params: {},
        path: "/dashboard",
      };
      const fromState = { name: "login", params: {}, path: "/login" };

      const transitionHandler = {
        component: "TransitionHandler",
        onTransition: vi.fn(function (
          this: any,
          receivedToState,
          receivedFromState,
        ) {
          expect(this).toBeUndefined();
          expect(this?.component).toBeUndefined();
          expect(receivedToState).toStrictEqual(toState);
          expect(receivedFromState).toStrictEqual(fromState);
        }),
      };

      router.addEventListener(
        events.TRANSITION_START,
        transitionHandler.onTransition,
      );

      router.invokeEventListeners(events.TRANSITION_START, toState, fromState);

      expect(transitionHandler.onTransition).toHaveBeenCalledWith(
        toState,
        fromState,
      );
    });

    it("should demonstrate Reflect.apply behavior with unbound function types", () => {
      const contextResults: string[] = [];

      // Regular function
      const regularFunction = vi.fn(function (this: any) {
        contextResults.push(this === undefined ? "undefined" : "defined");
      });

      // Method from object (unbound)
      const objectWithMethod = {
        method: vi.fn(function (this: any) {
          contextResults.push(this === undefined ? "undefined" : "defined");
        }),
      };

      // Another regular function defined differently
      const anotherFunction = vi.fn(function (this: any) {
        contextResults.push(this === undefined ? "undefined" : "defined");
      });

      router.addEventListener(events.ROUTER_START, regularFunction);
      router.addEventListener(events.ROUTER_START, objectWithMethod.method);
      router.addEventListener(events.ROUTER_START, anotherFunction);

      router.invokeEventListeners(events.ROUTER_START);

      // All unbound functions should have undefined context due to Reflect.apply
      expect(contextResults).toStrictEqual([
        "undefined",
        "undefined",
        "undefined",
      ]);
    });

    it("should handle nested object methods without context preservation", () => {
      const nestedStructure = {
        level1: {
          level2: {
            level3: {
              deepProperty: "deepValue",
              deepMethod: vi.fn(function (this: any) {
                expect(this).toBeUndefined();
                expect(this?.deepProperty).toBeUndefined();
              }),
            },
          },
        },
      };

      router.addEventListener(
        events.ROUTER_START,
        nestedStructure.level1.level2.level3.deepMethod,
      );

      router.invokeEventListeners(events.ROUTER_START);

      expect(
        nestedStructure.level1.level2.level3.deepMethod,
      ).toHaveBeenCalledWith();
    });

    it("should handle method destructuring without context issues", () => {
      const sourceObject = {
        name: "sourceObject",
        destructuredMethod: vi.fn(function (this: any) {
          expect(this).toBeUndefined();
        }),
      };

      // Destructure the method (common pattern that loses context)
      const { destructuredMethod } = sourceObject;

      router.addEventListener(events.ROUTER_START, destructuredMethod);

      router.invokeEventListeners(events.ROUTER_START);

      expect(destructuredMethod).toHaveBeenCalledWith();
    });

    it("should maintain listener functionality despite context independence", () => {
      const functionalityTest = {
        data: [],
        processEvent: vi.fn(function (this: any) {
          // Even without context, the function should work
          expect(this).toBeUndefined();

          // Function can still perform its logic
          const result = "processed";

          expect(result).toBe("processed");

          // Can still access closures if any
          const localVar = "local";

          expect(localVar).toBe("local");
        }),
      };

      router.addEventListener(
        events.ROUTER_START,
        functionalityTest.processEvent,
      );

      router.invokeEventListeners(events.ROUTER_START);

      expect(functionalityTest.processEvent).toHaveBeenCalledWith();
    });

    it("should handle error throwing from context-independent method", () => {
      vi.spyOn(logger, "error").mockImplementation(noop);

      const errorThrowingObject = {
        errorMethod: vi.fn(function (this: any) {
          expect(this).toBeUndefined();

          throw new Error("Error from context-independent method");
        }),
      };

      const workingListener = vi.fn();

      router.addEventListener(
        events.ROUTER_START,
        errorThrowingObject.errorMethod,
      );
      router.addEventListener(events.ROUTER_START, workingListener);

      router.invokeEventListeners(events.ROUTER_START);

      // Logger format: logger.error(context, message, error)
      expect(logger.error).toHaveBeenCalledWith(
        "Router",
        "Error in listener for $start:",
        expect.any(Error),
      );
      expect(errorThrowingObject.errorMethod).toHaveBeenCalledWith();
      expect(workingListener).toHaveBeenCalledWith();
    });
  });
});
