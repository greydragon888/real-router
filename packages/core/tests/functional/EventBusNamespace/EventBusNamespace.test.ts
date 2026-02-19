import { EventEmitter } from "event-emitter";
import { describe, it, expect, vi } from "vitest";

import { events } from "../../../src/constants";
import { createRouterFSM, routerEvents, routerStates } from "../../../src/fsm";
import { EventBusNamespace } from "../../../src/namespaces/EventBusNamespace";

import type { RouterEventMap } from "../../../src/types";

function createTestSubjects() {
  const fsm = createRouterFSM();
  // eslint-disable-next-line unicorn/prefer-event-target
  const emitter = new EventEmitter<RouterEventMap>();
  const namespace = new EventBusNamespace({ routerFSM: fsm, emitter });

  return { fsm, emitter, namespace };
}

describe("EventBusNamespace", () => {
  describe("static validateEventName", () => {
    it("should not throw for valid event names", () => {
      expect(() => {
        EventBusNamespace.validateEventName(events.ROUTER_START);
      }).not.toThrowError();
      expect(() => {
        EventBusNamespace.validateEventName(events.ROUTER_STOP);
      }).not.toThrowError();
      expect(() => {
        EventBusNamespace.validateEventName(events.TRANSITION_START);
      }).not.toThrowError();
      expect(() => {
        EventBusNamespace.validateEventName(events.TRANSITION_SUCCESS);
      }).not.toThrowError();
      expect(() => {
        EventBusNamespace.validateEventName(events.TRANSITION_ERROR);
      }).not.toThrowError();
      expect(() => {
        EventBusNamespace.validateEventName(events.TRANSITION_CANCEL);
      }).not.toThrowError();
    });

    it("should throw for invalid event names", () => {
      expect(() => {
        EventBusNamespace.validateEventName("invalid");
      }).toThrowError("Invalid event name: invalid");
      expect(() => {
        EventBusNamespace.validateEventName(undefined);
      }).toThrowError("Invalid event name: undefined");
    });
  });

  describe("static validateListenerArgs", () => {
    it("should not throw for valid event and function callback", () => {
      expect(() => {
        EventBusNamespace.validateListenerArgs(events.ROUTER_START, vi.fn());
      }).not.toThrowError();
    });

    it("should throw for invalid event name", () => {
      expect(() => {
        EventBusNamespace.validateListenerArgs("bad" as any, vi.fn() as any);
      }).toThrowError("Invalid event name: bad");
    });

    it("should throw for non-function callback", () => {
      expect(() => {
        EventBusNamespace.validateListenerArgs(
          events.ROUTER_START,
          "notAFunction" as never,
        );
      }).toThrowError("Expected callback to be a function");
    });
  });

  describe("static validateSubscribeListener", () => {
    it("should not throw for a function", () => {
      expect(() => {
        EventBusNamespace.validateSubscribeListener(vi.fn());
      }).not.toThrowError();
    });

    it("should throw for non-function", () => {
      expect(() => {
        EventBusNamespace.validateSubscribeListener("notAFunction");
      }).toThrowError("[router.subscribe] Expected a function.");
      expect(() => {
        EventBusNamespace.validateSubscribeListener(null);
      }).toThrowError("[router.subscribe] Expected a function.");
    });
  });

  describe("constructor", () => {
    it("should create an instance with FSM and emitter", () => {
      const { namespace } = createTestSubjects();

      expect(namespace).toBeInstanceOf(EventBusNamespace);
    });

    it("should initialize #currentToState as undefined", () => {
      const { namespace } = createTestSubjects();

      expect(namespace.getCurrentToState()).toBeUndefined();
    });
  });

  describe("#setupFSMActions", () => {
    it("should emit ROUTER_START when FSM transitions STARTING → STARTED", () => {
      const { fsm, emitter } = createTestSubjects();
      const listener = vi.fn();

      emitter.on(events.ROUTER_START, listener);

      fsm.send(routerEvents.START);
      fsm.send(routerEvents.STARTED);

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("should emit ROUTER_STOP when FSM transitions READY → STOP", () => {
      const { fsm, emitter } = createTestSubjects();
      const listener = vi.fn();

      emitter.on(events.ROUTER_STOP, listener);

      fsm.send(routerEvents.START);
      fsm.send(routerEvents.STARTED);
      fsm.send(routerEvents.STOP);

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("should emit TRANSITION_START when FSM READY → NAVIGATE", () => {
      const { fsm, emitter } = createTestSubjects();
      const listener = vi.fn();

      emitter.on(events.TRANSITION_START, listener);

      const toState = {
        name: "a",
        params: {},
        path: "/a",
        meta: { id: 1, params: {}, options: {}, redirected: false },
      };
      const fromState = undefined;

      fsm.send(routerEvents.START);
      fsm.send(routerEvents.STARTED);
      fsm.send(routerEvents.NAVIGATE, { toState, fromState });

      expect(listener).toHaveBeenCalledWith(toState, fromState);
    });

    it("should emit TRANSITION_SUCCESS when FSM TRANSITIONING → COMPLETE", () => {
      const { fsm, emitter } = createTestSubjects();
      const listener = vi.fn();

      emitter.on(events.TRANSITION_SUCCESS, listener);

      const state = {
        name: "a",
        params: {},
        path: "/a",
        meta: { id: 1, params: {}, options: {}, redirected: false },
      };
      const fromState = undefined;
      const opts = {};

      fsm.send(routerEvents.START);
      fsm.send(routerEvents.STARTED);
      fsm.send(routerEvents.NAVIGATE, { toState: state, fromState });
      fsm.send(routerEvents.COMPLETE, { state, fromState, opts });

      expect(listener).toHaveBeenCalledWith(state, fromState, opts);
    });

    it("should emit TRANSITION_CANCEL when FSM TRANSITIONING → CANCEL", () => {
      const { fsm, emitter } = createTestSubjects();
      const listener = vi.fn();

      emitter.on(events.TRANSITION_CANCEL, listener);

      const toState = {
        name: "a",
        params: {},
        path: "/a",
        meta: { id: 1, params: {}, options: {}, redirected: false },
      };
      const fromState = undefined;

      fsm.send(routerEvents.START);
      fsm.send(routerEvents.STARTED);
      fsm.send(routerEvents.NAVIGATE, { toState, fromState });
      fsm.send(routerEvents.CANCEL, { toState, fromState });

      expect(listener).toHaveBeenCalledWith(toState, fromState);
    });

    it("should emit TRANSITION_ERROR when FSM STARTING → FAIL", () => {
      const { fsm, emitter } = createTestSubjects();
      const listener = vi.fn();

      emitter.on(events.TRANSITION_ERROR, listener);

      fsm.send(routerEvents.START);
      fsm.send(routerEvents.FAIL, {
        toState: undefined,
        fromState: undefined,
        error: undefined,
      });

      expect(listener).toHaveBeenCalledWith(undefined, undefined, undefined);
    });

    it("should emit TRANSITION_ERROR when FSM READY → FAIL", () => {
      const { fsm, emitter } = createTestSubjects();
      const listener = vi.fn();

      emitter.on(events.TRANSITION_ERROR, listener);

      fsm.send(routerEvents.START);
      fsm.send(routerEvents.STARTED);
      fsm.send(routerEvents.FAIL, {
        toState: undefined,
        fromState: undefined,
        error: undefined,
      });

      expect(listener).toHaveBeenCalledWith(undefined, undefined, undefined);
    });

    it("should emit TRANSITION_ERROR when FSM TRANSITIONING → FAIL", () => {
      const { fsm, emitter } = createTestSubjects();
      const listener = vi.fn();

      emitter.on(events.TRANSITION_ERROR, listener);

      const toState = {
        name: "a",
        params: {},
        path: "/a",
        meta: { id: 1, params: {}, options: {}, redirected: false },
      };
      const fromState = undefined;

      fsm.send(routerEvents.START);
      fsm.send(routerEvents.STARTED);
      fsm.send(routerEvents.NAVIGATE, { toState, fromState });
      fsm.send(routerEvents.FAIL, { toState, fromState, error: undefined });

      expect(listener).toHaveBeenCalledWith(toState, fromState, undefined);
    });
  });

  describe("stub instance methods", () => {
    it("emitRouterStart does nothing", () => {
      const { namespace } = createTestSubjects();

      expect(() => {
        namespace.emitRouterStart();
      }).not.toThrowError();
    });

    it("emitRouterStop does nothing", () => {
      const { namespace } = createTestSubjects();

      expect(() => {
        namespace.emitRouterStop();
      }).not.toThrowError();
    });

    it("emitTransitionStart does nothing", () => {
      const { namespace } = createTestSubjects();
      const state = {
        name: "a",
        params: {},
        path: "/a",
        meta: { id: 1, params: {}, options: {}, redirected: false },
      };

      expect(() => {
        namespace.emitTransitionStart(state);
      }).not.toThrowError();
    });

    it("emitTransitionSuccess does nothing", () => {
      const { namespace } = createTestSubjects();
      const state = {
        name: "a",
        params: {},
        path: "/a",
        meta: { id: 1, params: {}, options: {}, redirected: false },
      };

      expect(() => {
        namespace.emitTransitionSuccess(state);
      }).not.toThrowError();
    });

    it("emitTransitionError does nothing", () => {
      const { namespace } = createTestSubjects();

      expect(() => {
        namespace.emitTransitionError();
      }).not.toThrowError();
    });

    it("emitTransitionCancel does nothing", () => {
      const { namespace } = createTestSubjects();
      const state = {
        name: "a",
        params: {},
        path: "/a",
        meta: { id: 1, params: {}, options: {}, redirected: false },
      };

      expect(() => {
        namespace.emitTransitionCancel(state);
      }).not.toThrowError();
    });

    it("sendStart does nothing", () => {
      const { namespace } = createTestSubjects();

      expect(() => {
        namespace.sendStart();
      }).not.toThrowError();
    });

    it("sendStop does nothing", () => {
      const { namespace } = createTestSubjects();

      expect(() => {
        namespace.sendStop();
      }).not.toThrowError();
    });

    it("sendDispose does nothing", () => {
      const { namespace } = createTestSubjects();

      expect(() => {
        namespace.sendDispose();
      }).not.toThrowError();
    });

    it("completeStart does nothing", () => {
      const { namespace } = createTestSubjects();

      expect(() => {
        namespace.completeStart();
      }).not.toThrowError();
    });

    it("beginTransition does nothing", () => {
      const { namespace } = createTestSubjects();
      const state = {
        name: "a",
        params: {},
        path: "/a",
        meta: { id: 1, params: {}, options: {}, redirected: false },
      };

      expect(() => {
        namespace.beginTransition(state);
      }).not.toThrowError();
    });

    it("completeTransition does nothing", () => {
      const { namespace } = createTestSubjects();
      const state = {
        name: "a",
        params: {},
        path: "/a",
        meta: { id: 1, params: {}, options: {}, redirected: false },
      };

      expect(() => {
        namespace.completeTransition(state);
      }).not.toThrowError();
    });

    it("failTransition does nothing", () => {
      const { namespace } = createTestSubjects();

      expect(() => {
        namespace.failTransition();
      }).not.toThrowError();
    });

    it("cancelTransition does nothing", () => {
      const { namespace } = createTestSubjects();
      const state = {
        name: "a",
        params: {},
        path: "/a",
        meta: { id: 1, params: {}, options: {}, redirected: false },
      };

      expect(() => {
        namespace.cancelTransition(state);
      }).not.toThrowError();
    });

    it("emitOrFailTransitionError does nothing", () => {
      const { namespace } = createTestSubjects();

      expect(() => {
        namespace.emitOrFailTransitionError();
      }).not.toThrowError();
    });

    it("canBeginTransition returns false", () => {
      const { namespace } = createTestSubjects();

      expect(namespace.canBeginTransition()).toBe(false);
    });

    it("canStart returns true when FSM is in IDLE state (START is a valid event from IDLE)", () => {
      const { namespace } = createTestSubjects();

      expect(namespace.canStart()).toBe(true);
    });

    it("canCancel returns false", () => {
      const { namespace } = createTestSubjects();

      expect(namespace.canCancel()).toBe(false);
    });

    it("isActive returns false in IDLE state", () => {
      const { namespace } = createTestSubjects();

      expect(namespace.isActive()).toBe(false);
    });

    it("isActive returns true when FSM is in STARTING state", () => {
      const { fsm, namespace } = createTestSubjects();

      fsm.send(routerEvents.START);

      expect(namespace.isActive()).toBe(true);
    });

    it("isActive returns false when FSM is in DISPOSED state", () => {
      const { fsm, namespace } = createTestSubjects();

      fsm.send(routerEvents.DISPOSE);

      expect(namespace.isActive()).toBe(false);
    });

    it("isDisposed returns false", () => {
      const { namespace } = createTestSubjects();

      expect(namespace.isDisposed()).toBe(false);
    });

    it("isTransitioning returns false", () => {
      const { namespace } = createTestSubjects();

      expect(namespace.isTransitioning()).toBe(false);
    });

    it("isReady returns false", () => {
      const { namespace } = createTestSubjects();

      expect(namespace.isReady()).toBe(false);
    });

    it("getState returns current FSM state", () => {
      const { namespace, fsm } = createTestSubjects();

      expect(namespace.getState()).toBe(routerStates.IDLE);

      fsm.send(routerEvents.START);

      expect(namespace.getState()).toBe(routerStates.STARTING);
    });

    it("getCurrentToState and setCurrentToState manage the current transition target", () => {
      const { namespace } = createTestSubjects();
      const state = {
        name: "a",
        params: {},
        path: "/a",
        meta: { id: 1, params: {}, options: {}, redirected: false },
      };

      expect(namespace.getCurrentToState()).toBeUndefined();

      namespace.setCurrentToState(state);

      expect(namespace.getCurrentToState()).toBe(state);

      namespace.setCurrentToState(undefined);

      expect(namespace.getCurrentToState()).toBeUndefined();
    });

    it("addEventListener returns a noop unsubscribe", () => {
      const { namespace } = createTestSubjects();
      const unsubscribe = namespace.addEventListener(
        events.ROUTER_START,
        vi.fn(),
      );

      expect(typeof unsubscribe).toBe("function");
      expect(() => {
        unsubscribe();
      }).not.toThrowError();
    });

    it("subscribe returns a noop unsubscribe", () => {
      const { namespace } = createTestSubjects();
      const unsubscribe = namespace.subscribe(vi.fn());

      expect(typeof unsubscribe).toBe("function");
      expect(() => {
        unsubscribe();
      }).not.toThrowError();
    });

    it("clearAll does nothing", () => {
      const { namespace } = createTestSubjects();

      expect(() => {
        namespace.clearAll();
      }).not.toThrowError();
    });

    it("setLimits does nothing", () => {
      const { namespace } = createTestSubjects();

      expect(() => {
        namespace.setLimits({
          maxListeners: 100,
          warnListeners: 50,
          maxEventDepth: 5,
        });
      }).not.toThrowError();
    });

    it("cancelTransitionIfRunning does nothing", () => {
      const { namespace } = createTestSubjects();

      expect(() => {
        namespace.cancelTransitionIfRunning(undefined);
      }).not.toThrowError();
    });

    it("cancelTransitionIfRunning cancels the ongoing transition when FSM is in TRANSITIONING state", () => {
      const { fsm, emitter, namespace } = createTestSubjects();
      const listener = vi.fn();

      emitter.on(events.TRANSITION_CANCEL, listener);

      const toState = {
        name: "a",
        params: {},
        path: "/a",
        meta: { id: 1, params: {}, options: {}, redirected: false },
      };

      fsm.send(routerEvents.START);
      fsm.send(routerEvents.STARTED);
      namespace.beginTransition(toState);

      namespace.cancelTransitionIfRunning(undefined);

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("emitOrFailTransitionError routes error through FSM when in READY state", () => {
      const { fsm, emitter, namespace } = createTestSubjects();
      const listener = vi.fn();

      emitter.on(events.TRANSITION_ERROR, listener);

      fsm.send(routerEvents.START);
      fsm.send(routerEvents.STARTED);

      namespace.emitOrFailTransitionError();

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("subscribe fires listener with route and previousRoute on TRANSITION_SUCCESS", () => {
      const { fsm, namespace } = createTestSubjects();
      const listener = vi.fn();

      namespace.subscribe(listener);

      const toState = {
        name: "a",
        params: {},
        path: "/a",
        meta: { id: 1, params: {}, options: {}, redirected: false },
      };

      fsm.send(routerEvents.START);
      fsm.send(routerEvents.STARTED);
      fsm.send(routerEvents.NAVIGATE, { toState, fromState: undefined });
      fsm.send(routerEvents.COMPLETE, {
        state: toState,
        fromState: undefined,
        opts: {},
      });

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith({
        route: toState,
        previousRoute: undefined,
      });
    });
  });
});
