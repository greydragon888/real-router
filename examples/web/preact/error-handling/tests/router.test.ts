import { createRouter, RouterError, errorCodes } from "@real-router/core";
import { afterEach, describe, it, expect, vi } from "vitest";

import { errorStore } from "../src/error-store";
import { routes } from "../src/routes";

import type { PluginFactory, Router } from "@real-router/core";

let router: Router;

const RESOLVED_SENTINEL = Symbol("did-not-reject");

async function captureRejection(promise: Promise<unknown>): Promise<unknown> {
  const result = await promise.then(
    () => RESOLVED_SENTINEL,
    (error: unknown) => error,
  );

  if (result === RESOLVED_SENTINEL) {
    throw new Error("Promise resolved instead of rejecting");
  }

  return result;
}

describe("error-handling tests", () => {
  afterEach(() => {
    router.stop();
    vi.useRealTimers();
  });

  describe("RouterError — try/catch pattern", () => {
    it("ROUTE_NOT_FOUND when navigating to nonexistent route", async () => {
      router = createRouter(routes, {
        defaultRoute: "home",
        allowNotFound: true,
      });
      await router.start("/");

      const error = await captureRejection(
        router.navigate("@@nonexistent-route"),
      );

      expect(error).toBeInstanceOf(RouterError);
      expect((error as RouterError).code).toBe(errorCodes.ROUTE_NOT_FOUND);
    });

    it("CANNOT_ACTIVATE when guard returns false", async () => {
      router = createRouter(routes, {
        defaultRoute: "home",
        allowNotFound: true,
      });
      await router.start("/");

      const error = await captureRejection(router.navigate("protected"));

      expect(error).toBeInstanceOf(RouterError);
      expect((error as RouterError).code).toBe(errorCodes.CANNOT_ACTIVATE);
      expect(router.getState()?.name).toBe("home");
    });

    it("TRANSITION_CANCELLED when second navigation supersedes first", async () => {
      router = createRouter(routes, {
        defaultRoute: "home",
        allowNotFound: true,
      });
      await router.start("/");

      vi.useFakeTimers();

      const firstNav = router.navigate("slow");
      const secondNav = router.navigate("about");

      await vi.advanceTimersByTimeAsync(5000);

      const error = await captureRejection(firstNav);

      expect(error).toBeInstanceOf(RouterError);
      expect((error as RouterError).code).toBe(errorCodes.TRANSITION_CANCELLED);

      const second = await secondNav;

      expect(second.name).toBe("about");
    });
  });

  describe("Fire-and-forget pattern", () => {
    it("suppresses error with .catch(() => {})", async () => {
      router = createRouter(routes, {
        defaultRoute: "home",
        allowNotFound: true,
      });
      await router.start("/");

      router.navigate("protected").catch(() => {});

      // Let microtask queue flush
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });

      expect(router.getState()?.name).toBe("home");
    });
  });

  describe("Error logger plugin — onTransitionError / onTransitionCancel", () => {
    it("onTransitionError receives CANNOT_ACTIVATE errors", async () => {
      const errors: { code: string }[] = [];

      const errorLoggerPlugin: PluginFactory = () => ({
        onTransitionError(_toState, _fromState, err) {
          errors.push({ code: err.code });
        },
      });

      router = createRouter(routes, {
        defaultRoute: "home",
        allowNotFound: true,
      });
      router.usePlugin(errorLoggerPlugin);
      await router.start("/");

      await router.navigate("protected").catch(() => {});

      expect(errors).toHaveLength(1);
      expect(errors[0]?.code).toBe(errorCodes.CANNOT_ACTIVATE);
    });

    it("onTransitionCancel receives TRANSITION_CANCELLED", async () => {
      const cancels: { name: string }[] = [];

      const cancelLoggerPlugin: PluginFactory = () => ({
        onTransitionCancel(toState) {
          cancels.push({ name: toState.name });
        },
      });

      router = createRouter(routes, {
        defaultRoute: "home",
        allowNotFound: true,
      });
      router.usePlugin(cancelLoggerPlugin);
      await router.start("/");

      vi.useFakeTimers();

      const firstNav = router.navigate("slow");

      router.navigate("about").catch(() => {});

      await vi.advanceTimersByTimeAsync(5000);
      await firstNav.catch(() => {});

      expect(cancels).toHaveLength(1);
      expect(cancels[0]?.name).toBe("slow");
    });
  });

  describe("errorStore integration", () => {
    it("accumulates errors via plugin callbacks", async () => {
      const errorLoggerPlugin: PluginFactory = () => ({
        onTransitionError(_toState, _fromState, err) {
          errorStore.add(err);
        },
      });

      router = createRouter(routes, {
        defaultRoute: "home",
        allowNotFound: true,
      });
      router.usePlugin(errorLoggerPlugin);
      await router.start("/");

      await router.navigate("protected").catch(() => {});
      await router.navigate("@@missing").catch(() => {});

      const entries = errorStore.getAll();

      expect(entries).toHaveLength(2);
      expect(entries[0]?.code).toBe(errorCodes.CANNOT_ACTIVATE);
      expect(entries[1]?.code).toBe(errorCodes.ROUTE_NOT_FOUND);
    });
  });
});
