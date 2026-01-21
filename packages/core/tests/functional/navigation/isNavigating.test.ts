import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { createTestRouter } from "../../helpers";

import type { Router } from "@real-router/core";

let router: Router;

describe("isNavigating", () => {
  beforeEach(() => {
    router = createTestRouter();
  });

  afterEach(() => {
    router.stop();
  });

  describe("initial state", () => {
    it("should return false for newly created router", () => {
      expect(router.isNavigating()).toBe(false);
    });

    it("should return false before router is started", () => {
      expect(router.isNavigating()).toBe(false);
    });
  });

  describe("after navigation completes", () => {
    it("should return false after navigation completes via callback", async () => {
      router.start("/home");

      await new Promise<void>((resolve) => {
        router.navigate("users", () => {
          resolve();
        });
      });

      // After navigation callback, should be false
      expect(router.isNavigating()).toBe(false);
    });

    it("should return false after start completes via callback", async () => {
      await new Promise<void>((resolve) => {
        router.start("/home", () => {
          resolve();
        });
      });

      expect(router.isNavigating()).toBe(false);
    });
  });

  describe("during async navigation with guards", () => {
    beforeEach(async () => {
      await new Promise<void>((resolve) => {
        router.start("/home", () => {
          resolve();
        });
      });
    });

    it("should return true during async canActivate guard", async () => {
      let resolveGuard: (value: boolean) => void;
      let isNavigatingDuringGuard = false;

      const guardPromise = new Promise<boolean>((resolve) => {
        resolveGuard = resolve;
      });

      router.addRoute({
        name: "protected",
        path: "/protected",
        canActivate: () => () => {
          isNavigatingDuringGuard = router.isNavigating();

          return guardPromise;
        },
      });

      const navigationPromise = new Promise<void>((resolve) => {
        router.navigate("protected", () => {
          resolve();
        });
      });

      // Give time for guard to be called
      await new Promise((resolve) => setTimeout(resolve, 10));

      // During guard execution, isNavigating should be true
      expect(isNavigatingDuringGuard).toBe(true);
      expect(router.isNavigating()).toBe(true);

      // Complete the guard
      resolveGuard!(true);
      await navigationPromise;

      // After navigation completes, should be false
      expect(router.isNavigating()).toBe(false);
    });

    it("should return true during async canDeactivate guard", async () => {
      let resolveGuard: (value: boolean) => void;
      let isNavigatingDuringGuard = false;

      const guardPromise = new Promise<boolean>((resolve) => {
        resolveGuard = resolve;
      });

      router.canDeactivate("home", () => () => {
        isNavigatingDuringGuard = router.isNavigating();

        return guardPromise;
      });

      const navigationPromise = new Promise<void>((resolve) => {
        router.navigate("users", () => {
          resolve();
        });
      });

      // Give time for guard to be called
      await new Promise((resolve) => setTimeout(resolve, 10));

      // During guard execution, isNavigating should be true
      expect(isNavigatingDuringGuard).toBe(true);
      expect(router.isNavigating()).toBe(true);

      // Complete the guard
      resolveGuard!(true);
      await navigationPromise;

      // After navigation completes, should be false
      expect(router.isNavigating()).toBe(false);
    });

    it("should return false after navigation completes with guard rejection", async () => {
      router.addRoute({
        name: "blocked",
        path: "/blocked",
        canActivate: () => () => false,
      });

      await new Promise<void>((resolve) => {
        router.navigate("blocked", () => {
          resolve();
        });
      });

      expect(router.isNavigating()).toBe(false);
    });
  });

  describe("during async middleware", () => {
    beforeEach(async () => {
      await new Promise<void>((resolve) => {
        router.start("/home", () => {
          resolve();
        });
      });
    });

    it("should return true during async middleware execution", async () => {
      let resolveMiddleware: () => void;
      let isNavigatingDuringMiddleware = false;

      const middlewarePromise = new Promise<void>((resolve) => {
        resolveMiddleware = resolve;
      });

      router.useMiddleware(() => async (): Promise<true> => {
        isNavigatingDuringMiddleware = router.isNavigating();
        await middlewarePromise;

        return true;
      });

      const navigationPromise = new Promise<void>((resolve) => {
        router.navigate("users", () => {
          resolve();
        });
      });

      // Give time for middleware to be called
      await new Promise((resolve) => setTimeout(resolve, 10));

      // During middleware execution, isNavigating should be true
      expect(isNavigatingDuringMiddleware).toBe(true);
      expect(router.isNavigating()).toBe(true);

      // Complete the middleware
      resolveMiddleware!();
      await navigationPromise;

      // After navigation completes, should be false
      expect(router.isNavigating()).toBe(false);
    });
  });

  describe("navigation cancellation", () => {
    beforeEach(async () => {
      await new Promise<void>((resolve) => {
        router.start("/home", () => {
          resolve();
        });
      });
    });

    it("should handle navigation cancelled by new navigation", async () => {
      let resolveGuard: (value: boolean) => void;

      const guardPromise = new Promise<boolean>((resolve) => {
        resolveGuard = resolve;
      });

      router.addRoute({
        name: "slow",
        path: "/slow",
        canActivate: () => () => guardPromise,
      });

      // Start slow navigation
      router.navigate("slow");

      // Give time for navigation to start
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(router.isNavigating()).toBe(true);

      // Cancel with new navigation and wait for it to complete
      await new Promise<void>((resolve) => {
        router.navigate("users", () => {
          resolve();
        });
      });

      // After new navigation completes, should be false
      expect(router.isNavigating()).toBe(false);

      // Cleanup - resolve the pending guard
      resolveGuard!(true);
    });
  });

  describe("multiple router instances", () => {
    it("should track navigation state independently per router", async () => {
      const router2 = createTestRouter();

      // Start both routers and wait for initial navigation to complete
      await new Promise<void>((resolve) => {
        router.start("/home", () => {
          resolve();
        });
      });
      await new Promise<void>((resolve) => {
        router2.start("/home", () => {
          resolve();
        });
      });

      // Verify both are started and not navigating
      expect(router.isStarted()).toBe(true);
      expect(router2.isStarted()).toBe(true);
      expect(router.isNavigating()).toBe(false);
      expect(router2.isNavigating()).toBe(false);

      // Navigate router1 synchronously
      await new Promise<void>((resolve) => {
        router.navigate("users", () => {
          resolve();
        });
      });

      // router1 completed, router2 unchanged
      expect(router.isNavigating()).toBe(false);
      expect(router2.isNavigating()).toBe(false);

      router2.stop();
    });
  });

  describe("edge cases", () => {
    it("should return false after stop", async () => {
      await new Promise<void>((resolve) => {
        router.start("/home", () => {
          resolve();
        });
      });

      router.stop();

      // After stop, no navigation should be in progress
      expect(router.isNavigating()).toBe(false);
    });
  });
});
