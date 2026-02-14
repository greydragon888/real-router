import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { errorCodes } from "@real-router/core";

import { createTestRouter } from "../../../helpers";

import type { Router } from "@real-router/core";

let router: Router;

describe("router.navigate() - middleware blocking", () => {
  beforeEach(async () => {
    router = createTestRouter();

    await router.start();
  });

  afterEach(() => {
    router.stop();

    vi.clearAllMocks();
  });

  describe("guards and middleware returning false", () => {
    describe("canDeactivate returns false", () => {
      it("should block transition when canDeactivate returns false", async () => {
        const blockingDeactivateGuard = vi.fn().mockReturnValue(false);

        router.addDeactivateGuard(
          "orders.pending",
          () => blockingDeactivateGuard,
        );

        // Navigate to initial state
        await router.navigate("orders.pending");

        blockingDeactivateGuard.mockClear();

        // Navigate away - should be blocked
        try {
          await router.navigate("profile");

          expect.fail("Should have thrown error");
        } catch (error: any) {
          expect(error?.code).toBe(errorCodes.CANNOT_DEACTIVATE);
          expect(blockingDeactivateGuard).toHaveBeenCalledTimes(1);
        }
      });

      it("should stop on first canDeactivate guard returning false", async () => {
        const blockingGuard = vi.fn().mockReturnValue(false);
        const nextGuard = vi.fn().mockReturnValue(true);

        router.addDeactivateGuard("orders", () => blockingGuard);
        router.addDeactivateGuard("orders.pending", () => nextGuard);

        await router.navigate("orders.pending");

        blockingGuard.mockClear();
        nextGuard.mockClear();

        try {
          await router.navigate("profile");

          expect.fail("Should have thrown error");
        } catch (error: any) {
          expect(error?.code).toBe(errorCodes.CANNOT_DEACTIVATE);
          // Based on current implementation order (child first)
          expect(nextGuard).toHaveBeenCalledTimes(1);
          expect(blockingGuard).toHaveBeenCalledTimes(1);
        }
      });

      it("should block navigation if canDeactivate returns false", async () => {
        await router.navigate("users");

        router.addDeactivateGuard("users", () => () => false);

        try {
          await router.navigate("orders");

          expect.fail("Should have thrown error");
        } catch (error: any) {
          expect(error?.code).toBe(errorCodes.CANNOT_DEACTIVATE);
        }

        expect(router.getState()?.name).toBe("users");
      });
    });

    describe("canActivate returns false", () => {
      it("should block transition when canActivate returns false", async () => {
        const blockingActivateGuard = vi.fn().mockReturnValue(false);

        router.addActivateGuard("profile", () => blockingActivateGuard);

        try {
          await router.navigate("profile");

          expect.fail("Should have thrown error");
        } catch (error: any) {
          expect(error?.code).toBe(errorCodes.CANNOT_ACTIVATE);
          expect(blockingActivateGuard).toHaveBeenCalledTimes(1);
        }
      });

      it("should stop on first canActivate guard returning false", async () => {
        const blockingGuard = vi.fn().mockReturnValue(false);
        const nextGuard = vi.fn().mockReturnValue(true);

        router.addActivateGuard("settings", () => blockingGuard);
        router.addActivateGuard("settings.account", () => nextGuard);

        try {
          await router.navigate("settings.account");

          expect.fail("Should have thrown error");
        } catch (error: any) {
          expect(error?.code).toBe(errorCodes.CANNOT_ACTIVATE);
          expect(blockingGuard).toHaveBeenCalledTimes(1);
          // Next guard should not be called due to blocking
          expect(nextGuard).not.toHaveBeenCalled();
        }
      });
    });

    describe("middleware returns false", () => {
      it("should block transition when middleware returns false", async () => {
        const blockingMiddleware = vi.fn().mockReturnValue(false);

        router.useMiddleware(() => blockingMiddleware);

        try {
          await router.navigate("orders.pending");

          expect.fail("Should have thrown error");
        } catch (error: any) {
          expect(error?.code).toBe(errorCodes.TRANSITION_ERR);
          expect(blockingMiddleware).toHaveBeenCalledTimes(1);
        }
      });

      it("should stop on first middleware returning false", async () => {
        const blockingMiddleware = vi.fn().mockReturnValue(false);
        const nextMiddleware = vi.fn().mockReturnValue(true);

        router.useMiddleware(() => blockingMiddleware);
        router.useMiddleware(() => nextMiddleware);

        try {
          await router.navigate("profile");

          expect.fail("Should have thrown error");
        } catch (error: any) {
          expect(error?.code).toBe(errorCodes.TRANSITION_ERR);
          expect(blockingMiddleware).toHaveBeenCalledTimes(1);
          // Next middleware should not be called due to blocking
          expect(nextMiddleware).not.toHaveBeenCalled();
        }
      });

      it("should block transition in middleware even with passing guards", async () => {
        const passingGuard = vi.fn().mockReturnValue(true);
        const blockingMiddleware = vi.fn().mockReturnValue(false);

        router.addActivateGuard("orders", () => passingGuard);
        router.useMiddleware(() => blockingMiddleware);

        try {
          await router.navigate("orders");

          expect.fail("Should have thrown error");
        } catch (error: any) {
          expect(error?.code).toBe(errorCodes.TRANSITION_ERR);
          // Guard should pass, but middleware blocks
          expect(passingGuard).toHaveBeenCalledTimes(1);
          expect(blockingMiddleware).toHaveBeenCalledTimes(1);
        }
      });
    });
  });

  describe("guards and middleware returning Promise.resolve(false)", () => {
    describe("canDeactivate returns Promise.resolve(false)", () => {
      it("should block transition when canDeactivate returns Promise.resolve(false)", async () => {
        const blockingPromiseGuard = vi.fn().mockResolvedValue(false);

        router.addDeactivateGuard("orders.pending", () => blockingPromiseGuard);

        // Navigate to initial state
        await router.navigate("orders.pending");

        blockingPromiseGuard.mockClear();

        // Navigate away - should be blocked
        try {
          await router.navigate("profile");

          expect.fail("Should have thrown error");
        } catch (error: any) {
          expect(error?.code).toBe(errorCodes.CANNOT_DEACTIVATE);
          expect(blockingPromiseGuard).toHaveBeenCalledTimes(1);
        }
      });

      it("should stop on first promise-based canDeactivate guard returning false", async () => {
        const blockingPromiseGuard = vi.fn().mockResolvedValue(false);
        const nextPromiseGuard = vi.fn().mockResolvedValue(true);

        router.addDeactivateGuard("orders", () => blockingPromiseGuard);
        router.addDeactivateGuard("orders.pending", () => nextPromiseGuard);

        await router.navigate("orders.pending");

        blockingPromiseGuard.mockClear();
        nextPromiseGuard.mockClear();

        try {
          await router.navigate("profile");

          expect.fail("Should have thrown error");
        } catch (error: any) {
          expect(error?.code).toBe(errorCodes.CANNOT_DEACTIVATE);
          // Based on current implementation order (child first)
          expect(nextPromiseGuard).toHaveBeenCalledTimes(1);
          expect(blockingPromiseGuard).toHaveBeenCalledTimes(1);
        }
      });
    });

    describe("canActivate returns Promise.resolve(false)", () => {
      it("should block transition when canActivate returns Promise.resolve(false)", async () => {
        const blockingPromiseGuard = vi.fn().mockResolvedValue(false);

        router.addActivateGuard("profile", () => blockingPromiseGuard);

        try {
          await router.navigate("profile");

          expect.fail("Should have thrown error");
        } catch (error: any) {
          expect(error?.code).toBe(errorCodes.CANNOT_ACTIVATE);
          expect(blockingPromiseGuard).toHaveBeenCalledTimes(1);
        }
      });

      it("should stop on first promise-based canActivate guard returning false", async () => {
        const blockingPromiseGuard = vi.fn().mockResolvedValue(false);
        const nextPromiseGuard = vi.fn().mockResolvedValue(true);

        router.addActivateGuard("settings", () => blockingPromiseGuard);
        router.addActivateGuard("settings.account", () => nextPromiseGuard);

        try {
          await router.navigate("settings.account");

          expect.fail("Should have thrown error");
        } catch (error: any) {
          expect(error?.code).toBe(errorCodes.CANNOT_ACTIVATE);
          expect(blockingPromiseGuard).toHaveBeenCalledTimes(1);
          // Next guard should not be called due to blocking
          expect(nextPromiseGuard).not.toHaveBeenCalled();
        }
      });
    });

    describe("middleware returns Promise.resolve(false)", () => {
      it("should block transition when middleware returns Promise.resolve(false)", async () => {
        const blockingPromiseMiddleware = vi.fn().mockResolvedValue(false);

        router.useMiddleware(() => blockingPromiseMiddleware);

        try {
          await router.navigate("orders.pending");

          expect.fail("Should have thrown error");
        } catch (error: any) {
          expect(error?.code).toBe(errorCodes.TRANSITION_ERR);
          expect(blockingPromiseMiddleware).toHaveBeenCalledTimes(1);
        }
      });

      it("should stop on first promise-based middleware returning false", async () => {
        const blockingPromiseMiddleware = vi.fn().mockResolvedValue(false);
        const nextPromiseMiddleware = vi.fn().mockResolvedValue(true);

        router.useMiddleware(() => blockingPromiseMiddleware);
        router.useMiddleware(() => nextPromiseMiddleware);

        try {
          await router.navigate("profile");

          expect.fail("Should have thrown error");
        } catch (error: any) {
          expect(error?.code).toBe(errorCodes.TRANSITION_ERR);
          expect(blockingPromiseMiddleware).toHaveBeenCalledTimes(1);
          // Next middleware should not be called due to blocking
          expect(nextPromiseMiddleware).not.toHaveBeenCalled();
        }
      });

      it("should block transition in promise middleware even with passing guards", async () => {
        const passingPromiseGuard = vi.fn().mockResolvedValue(true);
        const blockingPromiseMiddleware = vi.fn().mockResolvedValue(false);

        router.addActivateGuard("orders", () => passingPromiseGuard);
        router.useMiddleware(() => blockingPromiseMiddleware);

        try {
          await router.navigate("orders");

          expect.fail("Should have thrown error");
        } catch (error: any) {
          expect(error?.code).toBe(errorCodes.TRANSITION_ERR);
          // Guard should pass, but middleware blocks
          expect(passingPromiseGuard).toHaveBeenCalledTimes(1);
          expect(blockingPromiseMiddleware).toHaveBeenCalledTimes(1);
        }
      });
    });
  });

  describe("Issue #38: Promise.resolve(false) should block transitions", () => {
    // Test 1: canActivate returning Promise.resolve(false) should block
    it("should block transition when canActivate returns Promise.resolve(false)", async () => {
      const blockingGuard = vi.fn().mockResolvedValue(false);

      router.addActivateGuard("users", () => blockingGuard);

      try {
        await router.navigate("users");

        expect.fail("Should have thrown error");
      } catch (error: any) {
        expect(error).toBeDefined();
        expect(error.code).toBe(errorCodes.CANNOT_ACTIVATE);
      }

      expect(blockingGuard).toHaveBeenCalledTimes(1);
    });

    // Test 2: canDeactivate returning Promise.resolve(false) should block
    it("should block transition when canDeactivate returns Promise.resolve(false)", async () => {
      const blockingGuard = vi.fn().mockResolvedValue(false);

      await router.navigate("users");

      router.addDeactivateGuard("users", () => blockingGuard);

      try {
        await router.navigate("profile");

        expect.fail("Should have thrown error");
      } catch (error: any) {
        expect(error).toBeDefined();
        expect(error.code).toBe(errorCodes.CANNOT_DEACTIVATE);
      }

      expect(blockingGuard).toHaveBeenCalledTimes(1);
    });

    // Test 3: middleware returning Promise.resolve(false) should block
    it("should block transition when middleware returns Promise.resolve(false)", async () => {
      const blockingMiddleware = vi.fn().mockResolvedValue(false);

      router.useMiddleware(() => blockingMiddleware);

      try {
        await router.navigate("users");

        expect.fail("Should have thrown error");
      } catch (error: any) {
        expect(error).toBeDefined();
        expect(error.code).toBe(errorCodes.TRANSITION_ERR);
      }

      expect(blockingMiddleware).toHaveBeenCalledTimes(1);
    });

    // Test 4: Verify sync false still works (control test)
    it("should block transition when canActivate returns sync false", async () => {
      const blockingGuard = vi.fn().mockReturnValue(false);

      router.addActivateGuard("users", () => blockingGuard);

      try {
        await router.navigate("users");

        expect.fail("Should have thrown error");
      } catch (error: any) {
        expect(error).toBeDefined();
        expect(error.code).toBe(errorCodes.CANNOT_ACTIVATE);
      }
    });
  });
});
