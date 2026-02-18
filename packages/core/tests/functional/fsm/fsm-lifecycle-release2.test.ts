import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { errorCodes, events } from "@real-router/core";

import { createTestRouter } from "../../helpers";

import type { Router } from "@real-router/core";

let router: Router;

describe("FSM lifecycle — Release 2 (boolean flags removed)", () => {
  beforeEach(() => {
    router = createTestRouter();
  });

  afterEach(() => {
    router.stop();
  });

  describe("isActive() FSM state coverage", () => {
    it("isActive() returns true during STARTING — router is active while start() is in progress", async () => {
      vi.useFakeTimers();

      let isActiveDuringStart: boolean | undefined;

      const unsub = router.useMiddleware(() => async () => {
        isActiveDuringStart = router.isActive();
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      const promise = router.start("/home");

      await vi.runAllTimersAsync();
      await promise;

      expect(isActiveDuringStart).toBe(true);

      unsub();
      vi.useRealTimers();
    });

    it("isActive() returns true during TRANSITIONING — router is active while navigate() is in progress", async () => {
      await router.start("/home");

      vi.useFakeTimers();

      let isActiveDuringNav: boolean | undefined;

      const unsub = router.useMiddleware(() => async () => {
        isActiveDuringNav = router.isActive();
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      const promise = router.navigate("users");

      await vi.runAllTimersAsync();
      await promise;

      expect(isActiveDuringNav).toBe(true);

      unsub();
      vi.useRealTimers();
    });

    it("isActive() returns false after stop() — RouterFSM transitions to IDLE", async () => {
      await router.start("/home");

      expect(router.isActive()).toBe(true);

      router.stop();

      expect(router.isActive()).toBe(false);
    });
  });

  describe("stop() during STARTING — facade sends STOP directly to FSM", () => {
    it("stop() during navigation emits ROUTER_STOP — router was READY before navigation (R3)", async () => {
      vi.useFakeTimers();

      const onStop = vi.fn();

      router.addEventListener(events.ROUTER_STOP, onStop);

      const unsub = router.useMiddleware(() => async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      const startPromise = router
        .start("/home")
        .catch((error: unknown) => error);

      setTimeout(() => {
        router.stop();
      }, 10);

      await vi.runAllTimersAsync();

      const result = await startPromise;

      expect(result).toBeDefined();
      expect(onStop).toHaveBeenCalledTimes(1);

      unsub();
      vi.useRealTimers();
    });

    it("stop() during STARTING leaves router inactive — isActive() returns false after stop", async () => {
      vi.useFakeTimers();

      const unsub = router.useMiddleware(() => async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      const startPromise = router
        .start("/home")
        .catch((error: unknown) => error);

      setTimeout(() => {
        router.stop();
      }, 10);

      await vi.runAllTimersAsync();
      await startPromise;

      expect(router.isActive()).toBe(false);

      unsub();
      vi.useRealTimers();
    });

    it("router can start() again after stop() during STARTING — FSM returns to IDLE correctly", async () => {
      vi.useFakeTimers();

      const unsub = router.useMiddleware(() => async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      const startPromise = router
        .start("/home")
        .catch((error: unknown) => error);

      setTimeout(() => {
        router.stop();
      }, 10);

      await vi.runAllTimersAsync();
      await startPromise;

      unsub();
      vi.useRealTimers();

      await router.start("/users");

      expect(router.isActive()).toBe(true);
      expect(router.getState()?.name).toBe("users");
    });
  });

  describe("stop() from READY/TRANSITIONING emits ROUTER_STOP", () => {
    it("stop() from READY emits ROUTER_STOP exactly once", async () => {
      await router.start("/home");

      const onStop = vi.fn();

      router.addEventListener(events.ROUTER_STOP, onStop);

      router.stop();

      expect(onStop).toHaveBeenCalledTimes(1);
    });

    it("stop() from IDLE is a no-op — ROUTER_STOP not emitted", () => {
      const onStop = vi.fn();

      router.addEventListener(events.ROUTER_STOP, onStop);

      router.stop();

      expect(onStop).not.toHaveBeenCalled();
    });
  });

  describe("start() concurrent guard via FSM", () => {
    it("concurrent start() rejects with ROUTER_ALREADY_STARTED during STARTING phase", async () => {
      vi.useFakeTimers();

      const unsub = router.useMiddleware(() => async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      const firstStart = router.start("/home");
      const secondStart = router
        .start("/users")
        .catch((error: unknown) => error);

      await vi.runAllTimersAsync();

      await firstStart;

      const secondResult = await secondStart;

      expect(secondResult).toMatchObject({
        code: errorCodes.ROUTER_ALREADY_STARTED,
      });

      unsub();
      vi.useRealTimers();
    });
  });
});
