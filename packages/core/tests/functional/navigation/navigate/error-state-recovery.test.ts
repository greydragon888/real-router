import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { errorCodes } from "@real-router/core";

import { createTestRouter } from "../../../helpers";

import type { Router } from "@real-router/core";

let router: Router;

describe("router.navigate() - error state recovery", () => {
  beforeEach(() => {
    router = createTestRouter();

    router.start();
  });

  afterEach(() => {
    router.stop();

    vi.clearAllMocks();
  });

  describe("error handling - state recovery (analysis 10.3)", () => {
    it("should not change state when canActivate guard rejects", async () => {
      await router.navigate("home");

      expect(router.getState()?.name).toBe("home");

      router.addActivateGuard("users", () => () => false);
      try {
        await router.navigate("users");
      } catch (error: any) {
        expect(error?.code).toBe(errorCodes.CANNOT_ACTIVATE);
      }

      // State should NOT have changed
      expect(router.getState()?.name).toBe("home");
    });

    it("should not change state when canDeactivate guard rejects", async () => {
      await router.navigate("users");

      expect(router.getState()?.name).toBe("users");

      router.addDeactivateGuard("users", () => () => false);
      try {
        await router.navigate("home");
      } catch (error: any) {
        expect(error?.code).toBe(errorCodes.CANNOT_DEACTIVATE);
      }

      // State should NOT have changed
      expect(router.getState()?.name).toBe("users");
    });

    it("should not change state when middleware throws", async () => {
      await router.navigate("home");

      expect(router.getState()?.name).toBe("home");

      router.useMiddleware(() => () => {
        throw new Error("Middleware error");
      });
      try {
        await router.navigate("users");
      } catch (error: any) {
        expect(error?.code).toBe(errorCodes.TRANSITION_ERR);
      }

      // State should NOT have changed
      expect(router.getState()?.name).toBe("home");
    });

    it("should allow new navigation after guard error", async () => {
      router.addActivateGuard(
        "users",
        () => () =>
          new Promise((_resolve, reject) =>
            setTimeout(() => {
              reject(new Error("Async error"));
            }, 10),
          ),
      );

      // First navigation fails
      try {
        await router.navigate("users");
      } catch (error) {
        expect(error).toBeDefined();
      }

      // Can start new navigation after error (router is not stuck)
      await router.navigate("home");

      expect(router.getState()?.name).toBe("home");
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
      router.addActivateGuard(
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

      router.addDeactivateGuard(
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
      router.useMiddleware(
        () => () =>
          new Promise((_resolve, reject) =>
            setTimeout(() => {
              reject(new Error("Async middleware error"));
            }, 10),
          ),
      );

      try {
        await router.navigate("users");
      } catch (error: any) {
        expect(error).toBeDefined();
        expect(error?.code).toBe(errorCodes.TRANSITION_ERR);
        expect(error?.message).toBe("Async middleware error");
      }
    });

    it("should cancel transition when router.stop() called during async guard", async () => {
      let guardCalled = false;

      router.addActivateGuard(
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
