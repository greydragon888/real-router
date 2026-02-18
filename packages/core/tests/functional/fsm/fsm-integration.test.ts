import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { errorCodes, events } from "@real-router/core";

import { createTestRouter } from "../../helpers";

import type { Router } from "@real-router/core";

let router: Router;

describe("FSM integration", () => {
  beforeEach(() => {
    router = createTestRouter();
  });

  afterEach(() => {
    router.stop();
  });

  describe("RouterFSM lifecycle", () => {
    it("isActive() returns false before start() — RouterFSM starts in IDLE state", () => {
      expect(router.isActive()).toBe(false);
      expect(router.getState()).toBeUndefined();
    });

    it("isActive() returns true and getState() is defined after start() — RouterFSM reaches READY", async () => {
      await router.start("/home");

      expect(router.isActive()).toBe(true);
      expect(router.getState()).toBeDefined();
      expect(router.getState()?.name).toBe("home");
    });

    it("isActive() stays false after failed start() — RouterFSM reverts STARTING to IDLE via FAIL", async () => {
      const strictRouter = createTestRouter({ allowNotFound: false });

      await expect(
        strictRouter.start("/nonexistent/path"),
      ).rejects.toBeDefined();

      expect(strictRouter.isActive()).toBe(false);

      strictRouter.stop();
    });

    it("TRANSITION_START during start() receives fromState=undefined — no prior route in STARTING phase", async () => {
      const onTransitionStart = vi.fn();

      router.addEventListener(events.TRANSITION_START, onTransitionStart);

      await router.start("/home");

      expect(onTransitionStart).toHaveBeenCalledTimes(1);

      const [toState, fromState] = onTransitionStart.mock.calls[0];

      expect(toState).toBeDefined();
      expect(toState.name).toBe("home");
      expect(fromState).toBeUndefined();
    });

    it("double start() rejects with ROUTER_ALREADY_STARTED — RouterFSM READY state blocks START event", async () => {
      await router.start("/home");

      await expect(router.start("/home")).rejects.toMatchObject({
        code: errorCodes.ROUTER_ALREADY_STARTED,
      });
    });
  });

  describe("TransitionFSM navigation", () => {
    beforeEach(async () => {
      await router.start("/home");
    });

    it("TRANSITION_START and TRANSITION_SUCCESS each fire exactly once per successful navigate()", async () => {
      const onStart = vi.fn();
      const onSuccess = vi.fn();

      router.addEventListener(events.TRANSITION_START, onStart);
      router.addEventListener(events.TRANSITION_SUCCESS, onSuccess);

      await router.navigate("users");

      expect(onStart).toHaveBeenCalledTimes(1);
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });

    it("TRANSITION_ERROR fires without TRANSITION_SUCCESS when canActivate guard blocks", async () => {
      const onSuccess = vi.fn();
      const onError = vi.fn();

      router.addEventListener(events.TRANSITION_SUCCESS, onSuccess);
      router.addEventListener(events.TRANSITION_ERROR, onError);

      await expect(router.navigate("admin-protected")).rejects.toBeDefined();

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onSuccess).not.toHaveBeenCalled();

      const error = onError.mock.calls[0][2];

      expect(error).toMatchObject({ code: errorCodes.CANNOT_ACTIVATE });
    });

    it("navigate() succeeds after a previously failed navigate() — RouterFSM recovers to READY", async () => {
      await expect(router.navigate("admin-protected")).rejects.toBeDefined();

      const successListener = vi.fn();

      router.addEventListener(events.TRANSITION_SUCCESS, successListener);

      const state = await router.navigate("users");

      expect(state.name).toBe("users");
      expect(successListener).toHaveBeenCalledTimes(1);
    });

    it("TRANSITION_START fires before TRANSITION_SUCCESS during navigate() — correct invocation order", async () => {
      const onStart = vi.fn();
      const onSuccess = vi.fn();

      router.addEventListener(events.TRANSITION_START, onStart);
      router.addEventListener(events.TRANSITION_SUCCESS, onSuccess);

      await router.navigate("admin");

      expect(onStart.mock.invocationCallOrder[0]).toBeLessThan(
        onSuccess.mock.invocationCallOrder[0],
      );
    });

    it("async canActivate rejection emits TRANSITION_ERROR with CANNOT_ACTIVATE — async failure path", async () => {
      const onError = vi.fn();

      router.addEventListener(events.TRANSITION_ERROR, onError);

      await expect(router.navigate("auth-protected")).rejects.toBeDefined();

      expect(onError).toHaveBeenCalledTimes(1);

      const error = onError.mock.calls[0][2];

      expect(error).toMatchObject({ code: errorCodes.CANNOT_ACTIVATE });
    });
  });

  describe("FSM chain correctness", () => {
    it("TRANSITION_START during start() carries toState with correct name and path", async () => {
      const onStart = vi.fn();

      router.addEventListener(events.TRANSITION_START, onStart);

      await router.start("/users/list");

      expect(onStart).toHaveBeenCalledTimes(1);

      const [toState] = onStart.mock.calls[0];

      expect(toState.name).toBe("users.list");
      expect(toState.path).toBe("/users/list");
    });

    it("TRANSITION_SUCCESS during start() carries fromState=undefined — no prior route at initialization", async () => {
      const onSuccess = vi.fn();

      router.addEventListener(events.TRANSITION_SUCCESS, onSuccess);

      await router.start("/home");

      expect(onSuccess).toHaveBeenCalledTimes(1);

      const [toState, fromState] = onSuccess.mock.calls[0];

      expect(toState.name).toBe("home");
      expect(fromState).toBeUndefined();
    });

    it("TRANSITION_START during navigate() carries fromState matching the current router state", async () => {
      await router.start("/home");

      const onStart = vi.fn();

      router.addEventListener(events.TRANSITION_START, onStart);

      await router.navigate("users");

      expect(onStart).toHaveBeenCalledTimes(1);

      const [toState, fromState] = onStart.mock.calls[0];

      expect(toState.name).toBe("users");
      expect(fromState.name).toBe("home");
    });

    it("sequential navigations: TRANSITION_START fromState updates correctly for each navigate()", async () => {
      await router.start("/home");

      const startEvents: [{ name: string }, { name: string } | undefined][] =
        [];

      router.addEventListener(
        events.TRANSITION_START,
        (toState: { name: string }, fromState?: { name: string }) => {
          startEvents.push([toState, fromState]);
        },
      );

      await router.navigate("users");
      await router.navigate("admin");

      expect(startEvents).toHaveLength(2);

      const [firstEvent, secondEvent] = startEvents;

      expect(firstEvent[0].name).toBe("users");
      expect(firstEvent[1]?.name).toBe("home");
      expect(secondEvent[0].name).toBe("admin");
      expect(secondEvent[1]?.name).toBe("users");
    });

    it("three sequential navigations emit 3 TRANSITION_START and 3 TRANSITION_SUCCESS events total", async () => {
      await router.start("/home");

      const onStart = vi.fn();
      const onSuccess = vi.fn();

      router.addEventListener(events.TRANSITION_START, onStart);
      router.addEventListener(events.TRANSITION_SUCCESS, onSuccess);

      await router.navigate("users");
      await router.navigate("admin");
      await router.navigate("index");

      expect(onStart).toHaveBeenCalledTimes(3);
      expect(onSuccess).toHaveBeenCalledTimes(3);
    });
  });

  describe("edge cases", () => {
    it("router.isActive() stays true after TRANSITION_ERROR — RouterFSM returns to READY not IDLE", async () => {
      await router.start("/home");

      await expect(router.navigate("admin-protected")).rejects.toBeDefined();

      expect(router.isActive()).toBe(true);
      expect(router.getState()?.name).toBe("home");
    });

    it("navigateToDefault() emits TRANSITION_START and TRANSITION_SUCCESS", async () => {
      await router.start("/users");

      const onStart = vi.fn();
      const onSuccess = vi.fn();

      router.addEventListener(events.TRANSITION_START, onStart);
      router.addEventListener(events.TRANSITION_SUCCESS, onSuccess);

      await router.navigateToDefault();

      expect(onStart).toHaveBeenCalledTimes(1);
      expect(onSuccess).toHaveBeenCalledTimes(1);

      const [toState] = onSuccess.mock.calls[0];

      expect(toState.name).toBe("home");
    });

    it("multiple navigations emit distinct events: each navigate() produces its own event pair", async () => {
      await router.start("/home");

      const startNames: string[] = [];
      const successNames: string[] = [];

      router.addEventListener(
        events.TRANSITION_START,
        (toState: { name: string }) => {
          startNames.push(toState.name);
        },
      );
      router.addEventListener(
        events.TRANSITION_SUCCESS,
        (toState: { name: string }) => {
          successNames.push(toState.name);
        },
      );

      await router.navigate("users");
      await router.navigate("admin.dashboard");
      await router.navigate("index");

      expect(startNames).toStrictEqual(["users", "admin.dashboard", "index"]);
      expect(successNames).toStrictEqual(["users", "admin.dashboard", "index"]);
    });

    it("getState() reflects the new route inside TRANSITION_SUCCESS listener — FSM updates state before event fires", async () => {
      await router.start("/home");

      let stateSeenInsideListener: unknown;

      router.addEventListener(events.TRANSITION_SUCCESS, () => {
        stateSeenInsideListener = router.getState();
      });

      await router.navigate("admin");

      expect(stateSeenInsideListener).toBeDefined();
      expect((stateSeenInsideListener as { name: string }).name).toBe("admin");
    });
  });

  describe("stop and cancel", () => {
    it("stop() emits ROUTER_STOP — RouterFSM transitions READY→IDLE", async () => {
      await router.start("/home");

      const onStop = vi.fn();

      router.addEventListener(events.ROUTER_STOP, onStop);

      router.stop();

      expect(onStop).toHaveBeenCalledTimes(1);
    });

    it("isActive() returns false and getState() is undefined after stop()", async () => {
      await router.start("/home");

      expect(router.isActive()).toBe(true);

      router.stop();

      expect(router.isActive()).toBe(false);
      expect(router.getState()).toBeUndefined();
    });

    it("stop() during async navigation emits TRANSITION_CANCEL via fallback — routerFSM already IDLE", async () => {
      vi.useFakeTimers();

      await router.start("/home");

      const onCancel = vi.fn();
      const onSuccess = vi.fn();

      router.addEventListener(events.TRANSITION_CANCEL, onCancel);
      router.addEventListener(events.TRANSITION_SUCCESS, onSuccess);

      const unsub = router.useMiddleware(() => async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      const promise = router.navigate("users");

      setTimeout(() => {
        router.stop();
      }, 10);

      await vi.runAllTimersAsync();

      await expect(promise).rejects.toMatchObject({
        code: errorCodes.TRANSITION_CANCELLED,
      });

      expect(onCancel).toHaveBeenCalledTimes(1);
      expect(onSuccess).not.toHaveBeenCalled();

      unsub();
      vi.useRealTimers();
    });

    it("router recovers after stop() — can start() and navigate() again", async () => {
      await router.start("/home");

      router.stop();

      expect(router.isActive()).toBe(false);

      await router.start("/users");

      expect(router.isActive()).toBe(true);
      expect(router.getState()?.name).toBe("users");

      const state = await router.navigate("admin");

      expect(state.name).toBe("admin");
    });
  });

  describe("RouterFSM lifecycle (Release 2)", () => {
    it("isActive() returns true when STARTING (during start, before READY) — FSM in STARTING state", async () => {
      let isActiveWhenStarting: boolean | undefined;

      router.addEventListener(events.TRANSITION_START, () => {
        isActiveWhenStarting = router.isActive();
      });

      await router.start("/home");

      expect(isActiveWhenStarting).toBe(true);
    });

    it("isActive() returns true when TRANSITIONING (during navigate) — FSM in TRANSITIONING state", async () => {
      await router.start("/home");

      let isActiveWhenTransitioning: boolean | undefined;

      router.addEventListener(events.TRANSITION_START, () => {
        isActiveWhenTransitioning = router.isActive();
      });

      await router.navigate("users");

      expect(isActiveWhenTransitioning).toBe(true);
    });

    it("stop() during STARTING transitions FSM to IDLE — no ROUTER_STOP emitted", async () => {
      const onStop = vi.fn();

      router.addEventListener(events.ROUTER_STOP, onStop);

      router.addActivateGuard("home", () => () => {
        router.stop();

        return false;
      });

      await expect(router.start("/home")).rejects.toBeDefined();

      expect(onStop).not.toHaveBeenCalled();
      expect(router.isActive()).toBe(false);
    });
  });
});
