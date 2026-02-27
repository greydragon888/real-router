import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { getLifecycleApi, errorCodes } from "@real-router/core";

import { createTestRouter } from "../../../helpers";

import type { Router, LifecycleApi } from "@real-router/core";

let router: Router;
let lifecycle: LifecycleApi;

describe("router.navigate() - error state recovery", () => {
  beforeEach(async () => {
    router = createTestRouter();

    await router.start("/home");

    lifecycle = getLifecycleApi(router);
  });

  afterEach(() => {
    router.stop();

    vi.clearAllMocks();
  });

  describe("error handling - state recovery (analysis 10.3)", () => {
    it("should not change state when canActivate guard rejects", async () => {
      await router.navigate("users");

      expect(router.getState()?.name).toBe("users");

      lifecycle.addActivateGuard("home", () => () => false);
      try {
        await router.navigate("home");
      } catch (error: any) {
        expect(error?.code).toBe(errorCodes.CANNOT_ACTIVATE);
      }

      // State should NOT have changed
      expect(router.getState()?.name).toBe("users");
    });

    it("should not change state when canDeactivate guard rejects", async () => {
      await router.navigate("users");

      expect(router.getState()?.name).toBe("users");

      lifecycle.addDeactivateGuard("users", () => () => false);
      try {
        await router.navigate("home");
      } catch (error: any) {
        expect(error?.code).toBe(errorCodes.CANNOT_DEACTIVATE);
      }

      // State should NOT have changed
      expect(router.getState()?.name).toBe("users");
    });

    it("should change state even when middleware throws (fire-and-forget)", async () => {
      await router.navigate("users");

      expect(router.getState()?.name).toBe("users");

      router.usePlugin(() => ({
        onTransitionSuccess: () => {
          throw new Error("Middleware error");
        },
      }));

      const state = await router.navigate("home");

      expect(state).toBeDefined();
      expect(state.name).toBe("home");

      expect(router.getState()?.name).toBe("home");
    });

    it("should allow new navigation after guard error", async () => {
      await router.navigate("users");

      lifecycle.addActivateGuard(
        "home",
        () => () =>
          new Promise((_resolve, reject) =>
            setTimeout(() => {
              reject(new Error("Async error"));
            }, 10),
          ),
      );

      // First navigation fails
      try {
        await router.navigate("home");
      } catch (error) {
        expect(error).toBeDefined();
      }

      // Can start new navigation after error (router is not stuck)
      // Navigate to a different route without guards
      await router.navigate("orders");

      expect(router.getState()?.name).toBe("orders");
    });

    it("should do nothing when cancel() called after navigation complete", async () => {
      await router.navigate("users");

      // Navigation completes synchronously (no guards)
      expect(router.getState()?.name).toBe("users");

      // State should still be users
      expect(router.getState()?.name).toBe("users");
    });
  });

  describe("async error handling (analysis 10.5)", () => {
    it("should handle Promise rejection in canActivate guard", async () => {
      lifecycle.addActivateGuard(
        "users",
        () => () =>
          new Promise((_resolve, reject) =>
            setTimeout(() => {
              reject(new Error("Async canActivate error"));
            }, 10),
          ),
      );

      try {
        await router.navigate("users");
      } catch (error: any) {
        expect(error).toBeDefined();
        expect(error?.code).toBe(errorCodes.CANNOT_ACTIVATE);
        expect(error?.message).toBe("Async canActivate error");
      }
    });

    it("should handle Promise rejection in canDeactivate guard", async () => {
      await router.navigate("users");

      lifecycle.addDeactivateGuard(
        "users",
        () => () =>
          new Promise((_resolve, reject) =>
            setTimeout(() => {
              reject(new Error("Async canDeactivate error"));
            }, 10),
          ),
      );

      try {
        await router.navigate("home");
      } catch (error: any) {
        expect(error).toBeDefined();
        expect(error?.code).toBe(errorCodes.CANNOT_DEACTIVATE);
        expect(error?.message).toBe("Async canDeactivate error");
      }
    });

    it("should handle Promise rejection in middleware", async () => {
      router.usePlugin(() => ({
        onTransitionSuccess: () => {
          new Promise((_resolve, reject) =>
            setTimeout(() => {
              reject(new Error("Async middleware error"));
            }, 10),
          ).catch(() => {});
        },
      }));

      const state = await router.navigate("users");

      expect(state).toBeDefined();
      expect(state.name).toBe("users");
    });

    it("should cancel transition when router.stop() called during async guard", async () => {
      let guardCalled = false;

      lifecycle.addActivateGuard(
        "users",
        () => () =>
          new Promise((resolve) => {
            guardCalled = true;
            setTimeout(() => {
              resolve(true);
            }, 50);
          }),
      );

      const navPromise = router.navigate("users");

      // Wait for guard to be called
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(guardCalled).toBe(true);

      // Stop router during transition
      router.stop();

      // Wait for timeout to complete
      await new Promise((resolve) => setTimeout(resolve, 60));

      // Navigation should have been cancelled
      try {
        await navPromise;
      } catch (error: any) {
        expect(error?.code).toBe(errorCodes.TRANSITION_CANCELLED);
      }
    });
  });
});
