import { logger } from "@real-router/logger";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { errorCodes, events } from "@real-router/core";

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
        const fromState = router.getState();

        getObservableRouter()
          [$$observable]()
          .subscribe({ next: nextSpy }, { replay: false });

        router.navigate("users");

        expect(nextSpy).toHaveBeenCalledWith({
          route: expect.objectContaining({ name: "users" }),
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

        router.navigate("users");

        expect(nextSpy).not.toHaveBeenCalled();
      });

      it("should handle observer without next handler", () => {
        const completeSpy = vi.fn();
        const subscription = getObservableRouter()
          [$$observable]()
          .subscribe({ complete: completeSpy }, { replay: false });

        // Should not throw when navigation occurs
        expect(() => {
          router.navigate("users");
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

        router.navigate("users");

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

        router.navigate("users");

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
          router.navigate("users");
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

        router.navigate("users");

        expect(nextSpy).not.toHaveBeenCalled();
      });
    });
  });
});
