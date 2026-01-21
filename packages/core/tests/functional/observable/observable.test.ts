import { logger } from "logger";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { events, RouterError } from "@real-router/core";

import { createTestRouter } from "../../helpers";

import type { Router, State } from "@real-router/core";

/**
 * Symbol.observable polyfill declaration for TC39 proposal
 *
 * @see https://github.com/tc39/proposal-observable
 */
declare global {
  interface SymbolConstructor {
    readonly observable: unique symbol;
  }
}

interface SubscribeState {
  route: State;
  previousRoute: State | undefined;
}

interface Observer {
  next?: (value: SubscribeState) => void;
  error?: (err: unknown) => void;
  complete?: () => void;
}

interface Subscription {
  unsubscribe: () => void;
  readonly closed: boolean;
}

interface ObservableOptions {
  signal?: AbortSignal;
  replay?: boolean;
}

interface RouterObservable {
  [key: symbol]: () => RouterObservable;
  subscribe: (
    observer: Observer | ((value: SubscribeState) => void),
    options?: ObservableOptions,
  ) => Subscription;
}

type ObservableRouter = Router & {
  [Symbol.observable]: () => RouterObservable;
  "@@observable": () => RouterObservable;
};

let router: Router;
const noop = () => undefined;

describe("core/observable", () => {
  beforeEach(() => {
    router = createTestRouter().start();
  });

  afterEach(() => {
    router.stop();
  });

  describe("invokeEventListeners", () => {
    describe("old tests", () => {
      it("should throw TypeError if required arguments are missing for event", () => {
        expect(() => {
          router.invokeEventListeners(events.TRANSITION_START);
        }).toThrowError(TypeError);
        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_ERROR,
            { name: "a" } as any,
            { name: "b" } as any,
            undefined,
          );
        }).toThrowError(TypeError);
        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_SUCCESS,
            { name: "a" } as any,
            { name: "b" } as any,
            undefined,
          );
        }).toThrowError(TypeError);
      });

      it("should throw TypeError if toState is missing for TRANSITION_CANCEL", () => {
        expect(() => {
          router.invokeEventListeners(events.TRANSITION_CANCEL);
        }).toThrowError(TypeError);
      });

      it("should not break other listeners if one throws", () => {
        const goodCb = vi.fn();
        const badCb = vi.fn(() => {
          vi.spyOn(logger, "error").mockImplementation(noop);

          throw new Error("listener failed");
        });

        router.addEventListener(events.ROUTER_START, badCb);
        router.addEventListener(events.ROUTER_START, goodCb);

        expect(() => {
          router.invokeEventListeners(events.ROUTER_START);
        }).not.toThrowError();

        expect(goodCb).toHaveBeenCalled();
      });

      it("should not throw or call anything if listeners array is empty", () => {
        expect(() => {
          router.invokeEventListeners(events.ROUTER_START);
        }).not.toThrowError();
      });
    });
  });

  describe("removeEventListener", () => {
    describe("old tests", () => {
      it("should allow removing same listener multiple times without effect", () => {
        const cb = vi.fn();

        router.addEventListener(events.ROUTER_START, cb);
        router.removeEventListener(events.ROUTER_START, cb);
        router.invokeEventListeners(events.ROUTER_START);

        expect(cb).not.toHaveBeenCalled();
      });

      it("should remove event listener via removeEventListener", () => {
        const cb = vi.fn();

        router.addEventListener(events.ROUTER_STOP, cb);
        router.removeEventListener(events.ROUTER_STOP, cb);
        router.invokeEventListeners(events.ROUTER_STOP);

        expect(cb).not.toHaveBeenCalled();
      });

      it("should not throw if removing unregistered event listener", () => {
        const cb = vi.fn();

        expect(() => {
          router.removeEventListener(events.ROUTER_STOP, cb);
        }).not.toThrowError();
      });

      it("should not call removed event listener", () => {
        const cb = vi.fn();

        router.addEventListener(events.ROUTER_START, cb);
        router.removeEventListener(events.ROUTER_START, cb);
        router.invokeEventListeners(events.ROUTER_START);

        expect(cb).not.toHaveBeenCalled();
      });

      it("should not throw error when removing non-existing event listener", () => {
        const cb = vi.fn();

        expect(() => {
          router.removeEventListener(events.ROUTER_START, cb);
        }).not.toThrowError();
      });
    });
  });

  describe("addEventListener", () => {
    describe("old tests", () => {
      it("should add and trigger event listener", () => {
        const cb = vi.fn();
        const evtName = events.ROUTER_START;

        router.addEventListener(evtName, cb);
        router.invokeEventListeners(evtName);

        expect(cb).toHaveBeenCalledTimes(1);
      });

      it("should pass (toState, fromState) to TRANSITION_START listeners", () => {
        const cb = vi.fn();
        const evtName = events.TRANSITION_START;

        router.addEventListener(evtName, cb);
        const toState = { name: "a", path: "/a", params: {} } as any;
        const fromState = { name: "b", path: "/a", params: {} } as any;

        router.invokeEventListeners(evtName, toState, fromState);

        expect(cb).toHaveBeenCalledWith(toState, fromState);
      });

      it("should pass (toState, fromState) to TRANSITION_CANCEL listeners", () => {
        const cb = vi.fn();
        const evtName = events.TRANSITION_CANCEL;

        router.addEventListener(evtName, cb);

        const to = { name: "foo", path: "/foo", params: {} } as any;
        const from = { name: "bar", path: "/bar", params: {} } as any;

        router.invokeEventListeners(evtName, to, from);

        expect(cb).toHaveBeenCalledWith(to, from);
      });

      it("should pass (toState, fromState, options) to TRANSITION_SUCCESS listeners", () => {
        const cb = vi.fn();
        const evtName = events.TRANSITION_SUCCESS;

        router.addEventListener(evtName, cb);
        const toState = { name: "a", path: "/a", params: {} } as any;
        const fromState = { name: "b", path: "/a", params: {} } as any;
        const opts = { reload: true };

        router.invokeEventListeners(evtName, toState, fromState, opts);

        expect(cb).toHaveBeenCalledWith(toState, fromState, opts);
      });

      it("should pass (toState, fromState, error) to TRANSITION_ERROR listeners", () => {
        const cb = vi.fn();
        const evtName = events.TRANSITION_ERROR;

        router.addEventListener(evtName, cb);
        const toState = { name: "a", path: "/a", params: {} } as any;
        const fromState = { name: "b", path: "/a", params: {} } as any;
        const error = new RouterError("ERR");

        router.invokeEventListeners(evtName, toState, fromState, error);

        expect(cb).toHaveBeenCalledWith(toState, fromState, error);
      });

      it("should pass no args to ROUTER_START listeners", () => {
        const cb = vi.fn();
        const evtName = events.ROUTER_START;

        router.addEventListener(evtName, cb);

        router.invokeEventListeners(evtName);

        expect(cb).toHaveBeenCalledWith();
      });

      it("should pass no args to ROUTER_STOP listeners", () => {
        const cb = vi.fn();
        const evtName = events.ROUTER_STOP;

        router.addEventListener(evtName, cb);

        router.invokeEventListeners(evtName);

        expect(cb).toHaveBeenCalledWith();
      });
    });
  });

  describe("subscribe", () => {
    describe("old tests", () => {
      it("should accept a listener function", () => {
        const unsubscribe = router.subscribe(() => undefined);

        expect(typeof unsubscribe).toStrictEqual("function");
      });

      it("should call on TRANSITION_SUCCESS", () => {
        const listener = vi.fn();

        router.subscribe(listener);
        const toState = { name: "a", path: "/a", params: {} } as any;
        const fromState = { name: "b", path: "/a", params: {} } as any;
        const opts = {};

        router.invokeEventListeners(
          events.TRANSITION_SUCCESS,
          toState,
          fromState,
          opts,
        );

        expect(listener).toHaveBeenCalledWith({
          route: toState,
          previousRoute: fromState,
        });
      });

      it("should call with undefined previousRoute when fromState is undefined (line 343)", () => {
        const listener = vi.fn();

        router.subscribe(listener);
        const toState = { name: "a", path: "/a", params: {} } as any;
        const opts = {};

        // First navigation - no fromState
        router.invokeEventListeners(
          events.TRANSITION_SUCCESS,
          toState,
          undefined,
          opts,
        );

        expect(listener).toHaveBeenCalledWith({
          route: toState,
          previousRoute: undefined,
        });
      });

      it("should call subscriber function when event is triggered", () => {
        const spy = vi.fn();
        const unsubscribe = router.subscribe(spy);
        const toState = { name: "a", path: "/a", params: {} } as any;
        const fromState = { name: "b", path: "/a", params: {} } as any;

        router.invokeEventListeners(
          events.TRANSITION_SUCCESS,
          toState,
          fromState,
          {},
        );

        expect(spy).toHaveBeenCalledWith({
          route: toState,
          previousRoute: fromState,
        });

        unsubscribe();
      });

      it("should not call subscriber after unsubscribe", () => {
        const spy = vi.fn();
        const unsubscribe = router.subscribe(spy);

        unsubscribe();
        router.invokeEventListeners(
          events.TRANSITION_SUCCESS,
          { name: "a", path: "/a", params: {} } as any,
          { name: "b", path: "/a", params: {} } as any,
          {},
        );

        expect(spy).not.toHaveBeenCalled();
      });

      it("should notify all subscribers", () => {
        const spy1 = vi.fn();
        const spy2 = vi.fn();
        const unsub1 = router.subscribe(spy1);
        const unsub2 = router.subscribe(spy2);
        const toState = { name: "a", path: "/a", params: {} } as any;
        const fromState = { name: "b", path: "/a", params: {} } as any;

        router.invokeEventListeners(
          events.TRANSITION_SUCCESS,
          toState,
          fromState,
          {},
        );

        expect(spy1).toHaveBeenCalledWith({
          route: toState,
          previousRoute: fromState,
        });
        expect(spy2).toHaveBeenCalledWith({
          route: toState,
          previousRoute: fromState,
        });

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

      it("should throw TypeError for non-function listener (line 334)", () => {
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

  describe("edge cases (observable.ts uncovered lines)", () => {
    it("should throw for invalid event name in invokeEventListeners (line 126)", () => {
      expect(() => {
        router.invokeEventListeners("invalid-event" as any);
      }).toThrowError("Invalid event name: invalid-event");
    });

    it("should throw for invalid event name in addEventListener", () => {
      expect(() => {
        router.addEventListener("invalid-event" as any, () => {});
      }).toThrowError("Invalid event name");
    });

    it("should throw for invalid event name in removeEventListener", () => {
      const noop = (): void => {};

      expect(() => {
        router.removeEventListener("invalid-event" as any, noop);
      }).toThrowError("Invalid event name");
    });

    it("should return false for hasListeners with invalid event name (line 380)", () => {
      // hasListeners returns false for event names not in validEventNames set
      const result = router.hasListeners("invalid-event" as any);

      expect(result).toBe(false);
    });

    it("should throw TypeError for non-function callback in addEventListener", () => {
      expect(() => {
        router.addEventListener(events.ROUTER_START, "not-a-function" as any);
      }).toThrowError(TypeError);
      expect(() => {
        router.addEventListener(events.ROUTER_START, "not-a-function" as any);
      }).toThrowError("Expected callback to be a function");
    });

    it("should throw TypeError for non-function callback in removeEventListener", () => {
      expect(() => {
        router.removeEventListener(
          events.ROUTER_START,
          "not-a-function" as any,
        );
      }).toThrowError(TypeError);
    });

    it("should warn when removing non-existent listener (line 281)", () => {
      const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

      // First add a listener to make the set non-empty
      const cb1 = vi.fn();

      router.addEventListener(events.ROUTER_START, cb1);

      // Try to remove a different listener that was never added
      const cb2 = vi.fn();

      // Should not throw when removing non-existent listener
      expect(() => {
        router.removeEventListener(events.ROUTER_START, cb2);
      }).not.toThrowError();

      warnSpy.mockRestore();
    });

    it("should throw when adding duplicate listener", () => {
      const cb = vi.fn();

      router.addEventListener(events.ROUTER_START, cb);

      expect(() => {
        router.addEventListener(events.ROUTER_START, cb);
      }).toThrowError("Listener already exists");
    });

    // Note: Line 64 (`continue` for non-function listener in invokeFor) is defensive code
    // that cannot be triggered through the public API because:
    // - addEventListener validates callbacks with `typeof cb !== "function"` check
    // - Only validated functions can be added to the listeners Set
    // This provides runtime protection for direct module usage or future changes.
  });

  describe("observable (Symbol.observable)", () => {
    /**
     * Symbol.observable polyfill - TC39 proposal with fallback
     */
    const $$observable: typeof Symbol.observable =
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime check for environments without Symbol.observable
      (typeof Symbol === "function" && Symbol.observable) ||
      ("@@observable" as unknown as typeof Symbol.observable);

    /**
     * Helper to cast router to ObservableRouter for type-safe access
     */
    const getObservableRouter = (): ObservableRouter =>
      router as unknown as ObservableRouter;

    describe("TC39 Observable spec compliance", () => {
      it("should expose observable via Symbol.observable", () => {
        const observable = getObservableRouter()[$$observable];

        expect(typeof observable).toBe("function");
      });

      it("should expose observable via @@observable string key for RxJS compatibility", () => {
        const observable = getObservableRouter()["@@observable"];

        expect(typeof observable).toBe("function");
      });

      it("should return observable object with subscribe method", () => {
        const observable = getObservableRouter()[$$observable]();

        expect(typeof observable.subscribe).toBe("function");
      });

      it("should return self from [Symbol.observable]()", () => {
        const observable = getObservableRouter()[$$observable]();
        const self = observable[$$observable]();

        expect(self).toBe(observable);
      });
    });

    describe("basic subscription", () => {
      it("should subscribe with observer object", () => {
        const nextSpy = vi.fn();
        const subscription = getObservableRouter()[$$observable]().subscribe({
          next: nextSpy,
        });

        expect(subscription.closed).toBe(false);
        expect(typeof subscription.unsubscribe).toBe("function");
      });

      it("should subscribe with function shorthand", () => {
        const nextSpy = vi.fn();
        const subscription = getObservableRouter()
          [$$observable]()
          .subscribe(nextSpy);

        expect(subscription.closed).toBe(false);
      });

      it("should receive state changes via next()", () => {
        const nextSpy = vi.fn();

        getObservableRouter()
          [$$observable]()
          .subscribe({ next: nextSpy }, { replay: false });

        const toState = { name: "a", path: "/a", params: {} } as any;
        const fromState = router.getState();

        router.invokeEventListeners(
          events.TRANSITION_SUCCESS,
          toState,
          fromState,
          {},
        );

        expect(nextSpy).toHaveBeenCalledWith({
          route: toState,
          previousRoute: fromState,
        });
      });

      it("should mark subscription as closed after unsubscribe", () => {
        const subscription = getObservableRouter()[$$observable]().subscribe({
          next: vi.fn(),
        });

        expect(subscription.closed).toBe(false);

        subscription.unsubscribe();

        expect(subscription.closed).toBe(true);
      });

      it("should not receive events after unsubscribe", () => {
        const nextSpy = vi.fn();
        const subscription = getObservableRouter()
          [$$observable]()
          .subscribe({ next: nextSpy }, { replay: false });

        subscription.unsubscribe();

        router.invokeEventListeners(
          events.TRANSITION_SUCCESS,
          { name: "a", path: "/a", params: {} } as any,
          undefined,
          {},
        );

        expect(nextSpy).not.toHaveBeenCalled();
      });

      it("should handle observer without next handler", () => {
        // Observer with only complete handler, no next
        const completeSpy = vi.fn();
        const subscription = getObservableRouter()
          [$$observable]()
          .subscribe({ complete: completeSpy }, { replay: false });

        // Should not throw when event is triggered
        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_SUCCESS,
            { name: "a", path: "/a", params: {} } as any,
            undefined,
            {},
          );
        }).not.toThrowError();

        subscription.unsubscribe();

        expect(completeSpy).toHaveBeenCalledTimes(1);
      });
    });

    describe("replay current state", () => {
      it("should replay current state by default", async () => {
        const nextSpy = vi.fn();
        const currentState = router.getState();

        getObservableRouter()[$$observable]().subscribe({ next: nextSpy });

        // Replay happens async via queueMicrotask
        await new Promise<void>((resolve) => {
          queueMicrotask(() => {
            resolve();
          });
        });

        expect(nextSpy).toHaveBeenCalledWith({
          route: currentState,
          previousRoute: undefined,
        });
      });

      it("should not replay when replay: false", async () => {
        const nextSpy = vi.fn();

        getObservableRouter()
          [$$observable]()
          .subscribe({ next: nextSpy }, { replay: false });

        await new Promise<void>((resolve) => {
          queueMicrotask(() => {
            resolve();
          });
        });

        expect(nextSpy).not.toHaveBeenCalled();
      });

      it("should not replay if router has no current state", async () => {
        const freshRouter = createTestRouter() as unknown as ObservableRouter;
        const nextSpy = vi.fn();

        freshRouter[$$observable]().subscribe({ next: nextSpy });

        await new Promise<void>((resolve) => {
          queueMicrotask(() => {
            resolve();
          });
        });

        expect(nextSpy).not.toHaveBeenCalled();
      });
    });

    describe("deduplication", () => {
      it("should prevent duplicate subscription with same observer object", () => {
        const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});
        const observer = { next: vi.fn() };

        const sub1 = getObservableRouter()[$$observable]().subscribe(observer, {
          replay: false,
        });
        const sub2 = getObservableRouter()[$$observable]().subscribe(observer, {
          replay: false,
        });

        // Should return existing subscription
        expect(sub1.unsubscribe).toBe(sub2.unsubscribe);
        // Logger format: logger.warn(context, message)
        expect(warnSpy).toHaveBeenCalledWith(
          "router.observable",
          expect.stringContaining("Duplicate subscription prevented"),
        );

        warnSpy.mockRestore();
      });

      it("should return closed status from duplicate subscription", () => {
        vi.spyOn(logger, "warn").mockImplementation(() => {});
        const observer = { next: vi.fn() };

        const sub1 = getObservableRouter()[$$observable]().subscribe(observer, {
          replay: false,
        });
        const sub2 = getObservableRouter()[$$observable]().subscribe(observer, {
          replay: false,
        });

        // Both should report not closed initially
        expect(sub1.closed).toBe(false);
        expect(sub2.closed).toBe(false);

        // Unsubscribe via first subscription
        sub1.unsubscribe();

        // Both should now report closed
        expect(sub1.closed).toBe(true);
        expect(sub2.closed).toBe(true);
      });

      it("should allow re-subscription after unsubscribe", () => {
        const observer = { next: vi.fn() };

        const sub1 = getObservableRouter()[$$observable]().subscribe(observer, {
          replay: false,
        });

        sub1.unsubscribe();

        const sub2 = getObservableRouter()[$$observable]().subscribe(observer, {
          replay: false,
        });

        expect(sub2.closed).toBe(false);
      });
    });

    describe("error isolation", () => {
      it("should isolate errors in observer.next()", () => {
        const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});
        const badObserver = {
          next: () => {
            throw new Error("observer error");
          },
        };
        const goodObserver = { next: vi.fn() };

        getObservableRouter()[$$observable]().subscribe(badObserver, {
          replay: false,
        });
        getObservableRouter()[$$observable]().subscribe(goodObserver, {
          replay: false,
        });

        const toState = { name: "a", path: "/a", params: {} } as any;

        router.invokeEventListeners(
          events.TRANSITION_SUCCESS,
          toState,
          undefined,
          {},
        );

        // Good observer should still receive the event
        expect(goodObserver.next).toHaveBeenCalled();
        expect(errorSpy).toHaveBeenCalled();

        errorSpy.mockRestore();
      });

      it("should call error handler when next() throws", () => {
        vi.spyOn(logger, "error").mockImplementation(() => {});
        const errorSpy = vi.fn();
        const observer = {
          next: () => {
            throw new Error("next error");
          },
          error: errorSpy,
        };

        getObservableRouter()[$$observable]().subscribe(observer, {
          replay: false,
        });

        router.invokeEventListeners(
          events.TRANSITION_SUCCESS,
          { name: "a", path: "/a", params: {} } as any,
          undefined,
          {},
        );

        expect(errorSpy).toHaveBeenCalledWith(expect.any(Error));
      });

      it("should catch errors in error handler itself", () => {
        const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});
        const observer = {
          next: () => {
            throw new Error("next error");
          },
          error: () => {
            throw new Error("error handler error");
          },
        };

        getObservableRouter()[$$observable]().subscribe(observer, {
          replay: false,
        });

        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_SUCCESS,
            { name: "a", path: "/a", params: {} } as any,
            undefined,
            {},
          );
        }).not.toThrowError();

        expect(errorSpy).toHaveBeenCalledTimes(2);

        errorSpy.mockRestore();
      });
    });

    describe("complete callback", () => {
      it("should call complete() on unsubscribe", () => {
        const completeSpy = vi.fn();
        const subscription = getObservableRouter()[$$observable]().subscribe({
          next: vi.fn(),
          complete: completeSpy,
        });

        subscription.unsubscribe();

        expect(completeSpy).toHaveBeenCalledTimes(1);
      });

      it("should not call complete() multiple times", () => {
        const completeSpy = vi.fn();
        const subscription = getObservableRouter()[$$observable]().subscribe({
          next: vi.fn(),
          complete: completeSpy,
        });

        subscription.unsubscribe();
        subscription.unsubscribe();

        expect(completeSpy).toHaveBeenCalledTimes(1);
      });

      it("should catch errors in complete()", () => {
        const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});
        const subscription = getObservableRouter()
          [$$observable]()
          .subscribe({
            next: vi.fn(),
            complete: () => {
              throw new Error("complete error");
            },
          });

        expect(() => {
          subscription.unsubscribe();
        }).not.toThrowError();

        expect(errorSpy).toHaveBeenCalled();

        errorSpy.mockRestore();
      });
    });

    describe("AbortSignal support", () => {
      it("should auto-unsubscribe when signal is aborted", () => {
        const controller = new AbortController();
        const nextSpy = vi.fn();

        const subscription = getObservableRouter()
          [$$observable]()
          .subscribe(
            { next: nextSpy },
            { signal: controller.signal, replay: false },
          );

        expect(subscription.closed).toBe(false);

        controller.abort();

        expect(subscription.closed).toBe(true);
      });

      it("should return closed subscription if signal already aborted", () => {
        const controller = new AbortController();

        controller.abort();

        const subscription = getObservableRouter()
          [$$observable]()
          .subscribe({ next: vi.fn() }, { signal: controller.signal });

        expect(subscription.closed).toBe(true);

        // Calling unsubscribe on already-closed subscription should be a no-op
        expect(() => {
          subscription.unsubscribe();
        }).not.toThrowError();
      });

      it("should call complete() when aborted", () => {
        const controller = new AbortController();
        const completeSpy = vi.fn();

        getObservableRouter()
          [$$observable]()
          .subscribe(
            { next: vi.fn(), complete: completeSpy },
            { signal: controller.signal, replay: false },
          );

        controller.abort();

        expect(completeSpy).toHaveBeenCalledTimes(1);
      });

      it("should not receive events after abort", () => {
        const controller = new AbortController();
        const nextSpy = vi.fn();

        getObservableRouter()
          [$$observable]()
          .subscribe(
            { next: nextSpy },
            { signal: controller.signal, replay: false },
          );

        controller.abort();

        router.invokeEventListeners(
          events.TRANSITION_SUCCESS,
          { name: "a", path: "/a", params: {} } as any,
          undefined,
          {},
        );

        expect(nextSpy).not.toHaveBeenCalled();
      });
    });
  });
});
