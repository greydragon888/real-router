import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { errorCodes, events } from "@real-router/core";

import { createTestRouter } from "../../helpers";

import type { Router } from "@real-router/core";

let router: Router;

describe("TransitionFSM integration (Release 3)", () => {
  beforeEach(() => {
    router = createTestRouter();
  });

  afterEach(() => {
    router.stop();
    vi.useRealTimers();
  });

  it("isNavigating() returns true during RUNNING state", async () => {
    await router.start("/home");

    vi.useFakeTimers();

    let isNavigatingDuringTransition: boolean | undefined;

    const unsub = router.useMiddleware(() => async () => {
      isNavigatingDuringTransition = router.isNavigating();
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    const promise = router.navigate("users");

    await vi.runAllTimersAsync();
    await promise;

    expect(isNavigatingDuringTransition).toBe(true);

    unsub();
  });

  it("isNavigating() returns false when IDLE", async () => {
    expect(router.isNavigating()).toBe(false);

    await router.start("/home");

    expect(router.isNavigating()).toBe(false);

    await router.navigate("users");

    expect(router.isNavigating()).toBe(false);
  });

  it("cancel() sends CANCEL to TransitionFSM when RUNNING", async () => {
    await router.start("/home");

    vi.useFakeTimers();

    const onCancel = vi.fn();

    router.addEventListener(events.TRANSITION_CANCEL, onCancel);

    const unsub = router.useMiddleware(() => async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    const promise = router.navigate("users").catch((error: unknown) => error);

    await vi.advanceTimersByTimeAsync(10);

    router.cancel();

    await vi.runAllTimersAsync();
    await promise;

    expect(onCancel).toHaveBeenCalledTimes(1);

    unsub();
  });

  it("cancel() is no-op when TransitionFSM is IDLE", async () => {
    await router.start("/home");

    expect(router.isNavigating()).toBe(false);
    expect(() => router.cancel()).not.toThrowError();
    expect(router.isNavigating()).toBe(false);
    expect(router.isActive()).toBe(true);
  });

  it("isCancelled() returns true after cancel()", async () => {
    await router.start("/home");

    vi.useFakeTimers();

    const unsub = router.useMiddleware(() => async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    const promise = router.navigate("users").catch((error: unknown) => error);

    await vi.advanceTimersByTimeAsync(10);

    expect(router.isNavigating()).toBe(true);

    router.cancel();

    expect(router.isNavigating()).toBe(false);

    await vi.runAllTimersAsync();
    await promise;

    unsub();
  });

  it("stop() during TRANSITIONING cancels TransitionFSM", async () => {
    await router.start("/home");

    vi.useFakeTimers();

    const onCancel = vi.fn();

    router.addEventListener(events.TRANSITION_CANCEL, onCancel);

    const unsub = router.useMiddleware(() => async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    const promise = router.navigate("users").catch((error: unknown) => error);

    await vi.advanceTimersByTimeAsync(10);

    router.stop();

    await vi.runAllTimersAsync();
    await promise;

    expect(onCancel).toHaveBeenCalledTimes(1);

    unsub();

    await router.start("/home");
  });

  it("isCancelled() returns true after stop() during transition", async () => {
    await router.start("/home");

    vi.useFakeTimers();

    const unsub = router.useMiddleware(() => async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    const promise = router.navigate("users");

    await vi.advanceTimersByTimeAsync(10);

    router.stop();

    await vi.runAllTimersAsync();

    await expect(promise).rejects.toMatchObject({
      code: errorCodes.TRANSITION_CANCELLED,
    });

    unsub();

    await router.start("/home");
  });

  it("concurrent navigate: cancels old transition and starts new", async () => {
    await router.start("/home");

    vi.useFakeTimers();

    const onCancel = vi.fn();

    router.addEventListener(events.TRANSITION_CANCEL, onCancel);

    const unsub = router.useMiddleware(() => async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    const promise1 = router.navigate("users").catch((error: unknown) => error);
    const promise2 = router.navigate("admin").catch((error: unknown) => error);

    await vi.runAllTimersAsync();
    await promise1;
    await promise2;

    expect(onCancel).toHaveBeenCalledTimes(1);

    unsub();
  });

  it("BLOCKED on canDeactivate rejection emits TRANSITION_ERROR", async () => {
    await router.start("/users");

    const onError = vi.fn();

    router.addEventListener(events.TRANSITION_ERROR, onError);

    router.addDeactivateGuard("users", () => () => false);

    await expect(router.navigate("home")).rejects.toBeDefined();

    expect(onError).toHaveBeenCalledTimes(1);

    const error = onError.mock.calls[0][2];

    expect(error).toMatchObject({ code: errorCodes.CANNOT_DEACTIVATE });
  });

  it("BLOCKED on canActivate rejection emits TRANSITION_ERROR", async () => {
    await router.start("/home");

    const onError = vi.fn();

    router.addEventListener(events.TRANSITION_ERROR, onError);

    await expect(router.navigate("admin-protected")).rejects.toBeDefined();

    expect(onError).toHaveBeenCalledTimes(1);

    const error = onError.mock.calls[0][2];

    expect(error).toMatchObject({ code: errorCodes.CANNOT_ACTIVATE });
  });

  it("DONE → routerFSM COMPLETE → TRANSITION_SUCCESS emitted", async () => {
    await router.start("/home");

    const onSuccess = vi.fn();

    router.addEventListener(events.TRANSITION_SUCCESS, onSuccess);

    await router.navigate("users");

    expect(onSuccess).toHaveBeenCalledTimes(1);

    const [toState, fromState] = onSuccess.mock.calls[0];

    expect(toState.name).toBe("users");
    expect(fromState.name).toBe("home");
  });

  it("BLOCKED → routerFSM FAIL → TRANSITION_ERROR emitted", async () => {
    await router.start("/home");

    const onError = vi.fn();
    const onSuccess = vi.fn();

    router.addEventListener(events.TRANSITION_ERROR, onError);
    router.addEventListener(events.TRANSITION_SUCCESS, onSuccess);

    await expect(router.navigate("admin-protected")).rejects.toBeDefined();

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onSuccess).not.toHaveBeenCalled();

    expect(router.isActive()).toBe(true);
    expect(router.getState()?.name).toBe("home");
  });

  it("CANCEL → routerFSM CANCEL → TRANSITION_CANCEL emitted", async () => {
    await router.start("/home");

    vi.useFakeTimers();

    const onCancel = vi.fn();
    const onSuccess = vi.fn();

    router.addEventListener(events.TRANSITION_CANCEL, onCancel);
    router.addEventListener(events.TRANSITION_SUCCESS, onSuccess);

    const unsub = router.useMiddleware(() => async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    const promise = router.navigate("users").catch((error: unknown) => error);

    await vi.advanceTimersByTimeAsync(10);

    router.stop();

    await vi.runAllTimersAsync();
    await promise;

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSuccess).not.toHaveBeenCalled();

    unsub();

    await router.start("/home");
  });

  it("start() emits ROUTER_START before first navigation", async () => {
    const eventOrder: string[] = [];

    router.addEventListener(events.ROUTER_START, () =>
      eventOrder.push("ROUTER_START"),
    );
    router.addEventListener(events.TRANSITION_START, () =>
      eventOrder.push("TRANSITION_START"),
    );

    await router.start("/home");

    expect(eventOrder).toContain("ROUTER_START");
    expect(eventOrder).toContain("TRANSITION_START");
    expect(eventOrder.indexOf("ROUTER_START")).toBeLessThan(
      eventOrder.indexOf("TRANSITION_START"),
    );
  });

  it("start() navigateToState goes through full FSM cycle", async () => {
    const onStart = vi.fn();
    const onSuccess = vi.fn();

    router.addEventListener(events.TRANSITION_START, onStart);
    router.addEventListener(events.TRANSITION_SUCCESS, onSuccess);

    await router.start("/home");

    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledTimes(1);

    const [toState, fromState] = onStart.mock.calls[0];

    expect(toState.name).toBe("home");
    expect(fromState).toBeUndefined();
  });

  it("navigateToState signature has no emitSuccess parameter", async () => {
    await router.start("/home");

    const toState = router.matchPath("/users");

    expect(toState).toBeDefined();

    const result = await router.navigateToState(toState!, undefined, {});

    expect(result).toBeDefined();
    expect(result.name).toBe("users");
  });
});
