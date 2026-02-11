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
    it("should not change state when canActivate guard rejects", () => {
      router.navigate("home");

      expect(router.getState()?.name).toBe("home");

      router.addActivateGuard("users", () => () => false);
      router.navigate("users", (err) => {
        expect(err?.code).toBe(errorCodes.CANNOT_ACTIVATE);
      });

      // State should NOT have changed
      expect(router.getState()?.name).toBe("home");
    });

    it("should not change state when canDeactivate guard rejects", () => {
      router.navigate("users");

      expect(router.getState()?.name).toBe("users");

      router.addDeactivateGuard("users", () => () => false);
      router.navigate("home", (err) => {
        expect(err?.code).toBe(errorCodes.CANNOT_DEACTIVATE);
      });

      // State should NOT have changed
      expect(router.getState()?.name).toBe("users");
    });

    it("should not change state when middleware throws", () => {
      router.navigate("home");

      expect(router.getState()?.name).toBe("home");

      router.useMiddleware(() => () => {
        throw new Error("Middleware error");
      });
      router.navigate("users", (err) => {
        expect(err?.code).toBe(errorCodes.TRANSITION_ERR);
      });

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
      await new Promise<void>((resolve) => {
        router.navigate("users", (err) => {
          expect(err).toBeDefined();

          resolve();
        });
      });

      // Can start new navigation after error (router is not stuck)
      router.navigate("home", (err) => {
        expect(err).toBeUndefined();
      });

      expect(router.getState()?.name).toBe("home");
    });

    it("should do nothing when cancel() called after navigation complete", () => {
      const callback = vi.fn();

      const cancel = router.navigate("users", callback);

      // Navigation completes synchronously (no guards)
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(undefined, expect.any(Object));

      // Calling cancel after complete should do nothing
      cancel();
      cancel();
      cancel();

      // Callback should still have been called only once
      expect(callback).toHaveBeenCalledTimes(1);
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

      await new Promise<void>((resolve) => {
        router.navigate("users", (err) => {
          expect(err).toBeDefined();
          expect(err?.code).toBe(errorCodes.CANNOT_ACTIVATE);
          expect(err?.message).toBe("Async canActivate error");

          resolve();
        });
      });
    });

    it("should handle Promise rejection in canDeactivate guard", async () => {
      router.navigate("users");

      router.addDeactivateGuard(
        "users",
        () => () =>
          new Promise((_resolve, reject) =>
            setTimeout(() => {
              reject(new Error("Async canDeactivate error"));
            }, 10),
          ),
      );

      await new Promise<void>((resolve) => {
        router.navigate("home", (err) => {
          expect(err).toBeDefined();
          expect(err?.code).toBe(errorCodes.CANNOT_DEACTIVATE);
          expect(err?.message).toBe("Async canDeactivate error");

          resolve();
        });
      });
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

      await new Promise<void>((resolve) => {
        router.navigate("users", (err) => {
          expect(err).toBeDefined();
          expect(err?.code).toBe(errorCodes.TRANSITION_ERR);
          expect(err?.message).toBe("Async middleware error");

          resolve();
        });
      });
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

      const callback = vi.fn();

      router.navigate("users", callback);

      // Wait for guard to be called
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(guardCalled).toBe(true);

      // Stop router during transition
      router.stop();

      // Wait for timeout to complete
      await new Promise((resolve) => setTimeout(resolve, 60));

      // Callback should have been called with TRANSITION_CANCELLED
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ code: errorCodes.TRANSITION_CANCELLED }),
      );
    });
  });
});
