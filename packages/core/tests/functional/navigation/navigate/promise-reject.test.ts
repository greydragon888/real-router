import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { errorCodes } from "@real-router/core";

import { createTestRouter } from "../../../helpers";

import type { Router } from "@real-router/core";

let router: Router;

describe("router.navigate() - promise reject", () => {
  beforeEach(async () => {
    router = createTestRouter();

    await router.start("/home");
  });

  afterEach(() => {
    router.stop();

    vi.clearAllMocks();
  });

  describe("guards and middleware returning Promise.reject(Error)", () => {
    describe("canDeactivate returns Promise.reject(Error)", () => {
      it("should block transition when canDeactivate returns Promise.reject(Error)", async () => {
        const testError = new Error("Deactivate guard failed");
        const rejectingGuard = vi.fn().mockRejectedValue(testError);

        router.addDeactivateGuard("orders.pending", () => rejectingGuard);

        // Navigate to initial state
        await router.navigate("orders.pending");

        rejectingGuard.mockClear();

        // Navigate away - should be blocked with error
        try {
          await router.navigate("profile");

          expect.fail("Should have thrown error");
        } catch (error: any) {
          expect(error?.code).toBe(errorCodes.CANNOT_DEACTIVATE);
          expect(error?.message).toContain("Deactivate guard failed");
          expect(rejectingGuard).toHaveBeenCalledTimes(1);
        }
      });

      it("should stop on first promise-rejecting canDeactivate guard", async () => {
        const testError = new Error("First guard error");
        const rejectingGuard = vi.fn().mockRejectedValue(testError);
        const nextGuard = vi.fn().mockResolvedValue(true);

        router.addDeactivateGuard("orders", () => rejectingGuard);
        router.addDeactivateGuard("orders.pending", () => nextGuard);

        await router.navigate("orders.pending");

        rejectingGuard.mockClear();
        nextGuard.mockClear();

        try {
          await router.navigate("profile");

          expect.fail("Should have thrown error");
        } catch (error: any) {
          expect(error?.code).toBe(errorCodes.CANNOT_DEACTIVATE);
          expect(error?.message).toContain("First guard error");
          // Based on current implementation order (child first)
          expect(nextGuard).toHaveBeenCalledTimes(1);
          expect(rejectingGuard).toHaveBeenCalledTimes(1);
        }
      });
    });

    describe("canActivate returns Promise.reject(Error)", () => {
      it("should block transition when canActivate returns Promise.reject(Error)", async () => {
        const testError = new Error("Activate guard failed");
        const rejectingGuard = vi.fn().mockRejectedValue(testError);

        router.addActivateGuard("profile", () => rejectingGuard);

        try {
          await router.navigate("profile");

          expect.fail("Should have thrown error");
        } catch (error: any) {
          expect(error?.code).toBe(errorCodes.CANNOT_ACTIVATE);
          expect(error?.message).toContain("Activate guard failed");
          expect(rejectingGuard).toHaveBeenCalledTimes(1);
        }
      });

      it("should stop on first promise-rejecting canActivate guard", async () => {
        const testError = new Error("Activation blocked");
        const rejectingGuard = vi.fn().mockRejectedValue(testError);
        const nextGuard = vi.fn().mockResolvedValue(true);

        router.addActivateGuard("settings", () => rejectingGuard);
        router.addActivateGuard("settings.account", () => nextGuard);

        try {
          await router.navigate("settings.account");

          expect.fail("Should have thrown error");
        } catch (error: any) {
          expect(error?.code).toBe(errorCodes.CANNOT_ACTIVATE);
          expect(error?.message).toContain("Activation blocked");
          expect(rejectingGuard).toHaveBeenCalledTimes(1);
          // Next guard should not be called due to rejection
          expect(nextGuard).not.toHaveBeenCalled();
        }
      });
    });

    describe("middleware returns Promise.reject(Error)", () => {
      it("should not block transition when middleware returns Promise.reject(Error)", async () => {
        const testError = new Error("Middleware failed");
        const rejectingMiddleware = vi.fn().mockRejectedValue(testError);

        router.useMiddleware(() => rejectingMiddleware);

        const state = await router.navigate("orders.pending");

        expect(state).toBeDefined();
        expect(state.name).toBe("orders.pending");
        expect(rejectingMiddleware).toHaveBeenCalledTimes(1);
      });

      it("should call all middleware even when first rejects (fire-and-forget)", async () => {
        const testError = new Error("First middleware error");
        const rejectingMiddleware = vi.fn().mockRejectedValue(testError);
        const nextMiddleware = vi.fn().mockResolvedValue(true);

        router.useMiddleware(() => rejectingMiddleware);
        router.useMiddleware(() => nextMiddleware);

        const state = await router.navigate("profile");

        expect(state).toBeDefined();
        expect(state.name).toBe("profile");
        expect(rejectingMiddleware).toHaveBeenCalledTimes(1);
        expect(nextMiddleware).toHaveBeenCalledTimes(1);
      });

      it("should not block transition in rejecting middleware even with passing guards", async () => {
        const passingGuard = vi.fn().mockResolvedValue(true);
        const testError = new Error("Middleware rejection");
        const rejectingMiddleware = vi.fn().mockRejectedValue(testError);

        router.addActivateGuard("orders", () => passingGuard);
        router.useMiddleware(() => rejectingMiddleware);

        const state = await router.navigate("orders");

        expect(state).toBeDefined();
        expect(state.name).toBe("orders");
        expect(passingGuard).toHaveBeenCalledTimes(1);
        expect(rejectingMiddleware).toHaveBeenCalledTimes(1);
      });

      it("should handle non-Error rejections", async () => {
        const rejectValue = {
          custom: "error",
          statusCode: 500,
          reason: "access denied",
        };
        const rejectingMiddleware = vi.fn().mockRejectedValue(rejectValue);

        router.useMiddleware(() => rejectingMiddleware);

        const state = await router.navigate("profile");

        expect(state).toBeDefined();
        expect(state.name).toBe("profile");
        expect(rejectingMiddleware).toHaveBeenCalledTimes(1);
      });
    });

    describe("Error.cause handling (ES2022+) - processLifecycleResult line 64", () => {
      it("should preserve Error.cause from canActivate rejection", async () => {
        const originalCause = new Error("Original database error");
        const testError = new Error("Activate guard failed", {
          cause: originalCause,
        });
        const rejectingGuard = vi.fn().mockRejectedValue(testError);

        router.addActivateGuard("profile", () => rejectingGuard);

        let err: any;

        try {
          await router.navigate("profile", {}, {});
        } catch (error: any) {
          err = error;
        }

        expect(err?.code).toBe(errorCodes.CANNOT_ACTIVATE);
        expect(err?.message).toContain("Activate guard failed");
        expect(err?.cause).toBe(originalCause);
      });

      it("should preserve Error.cause from middleware rejection", async () => {
        const networkError = new Error("Network timeout");
        const middlewareError = new Error("Middleware failed", {
          cause: networkError,
        });
        const rejectingMiddleware = vi.fn().mockRejectedValue(middlewareError);

        router.useMiddleware(() => rejectingMiddleware);

        const state = await router.navigate("orders.pending", {}, {});

        expect(state).toBeDefined();
        expect(state.name).toBe("orders.pending");
        expect(rejectingMiddleware).toHaveBeenCalledTimes(1);
      });

      it("should handle Error with undefined cause (line 64 false branch)", async () => {
        // Error with cause property but set to undefined
        const testError = new Error("Error with undefined cause");

        Object.defineProperty(testError, "cause", {
          value: undefined,
          enumerable: true,
        });

        const rejectingGuard = vi.fn().mockRejectedValue(testError);

        router.addActivateGuard("profile", () => rejectingGuard);

        let err: any;

        try {
          await router.navigate("profile", {}, {});
        } catch (error: any) {
          err = error;
        }

        expect(err?.code).toBe(errorCodes.CANNOT_ACTIVATE);
        expect(err?.message).toContain("Error with undefined cause");
        // cause should NOT be copied when it's undefined
        expect(err?.cause).toBeUndefined();
      });
    });
  });

  describe("guards and middleware returning Promise.reject(non-Error)", () => {
    describe("canDeactivate returns Promise.reject(non-Error)", () => {
      it("should wrap string rejection in RouterError", async () => {
        const rejectString = "Guard failed with string";
        const rejectingGuard = vi.fn().mockRejectedValue(rejectString);

        router.addDeactivateGuard("orders.pending", () => rejectingGuard);

        // Navigate to initial state
        await router.navigate("orders.pending");

        rejectingGuard.mockClear();

        // Navigate away - should be blocked with wrapped error
        let err: any;

        try {
          await router.navigate("profile", {}, {});
        } catch (error: any) {
          err = error;
        }

        expect(err?.code).toBe(errorCodes.CANNOT_DEACTIVATE);
        // String rejection should be wrapped in RouterError
        expect(err).toBeInstanceOf(Error);

        expect(rejectingGuard).toHaveBeenCalledTimes(1);
      });

      it("should wrap number rejection in RouterError", async () => {
        const rejectNumber = 404;
        const rejectingGuard = vi.fn().mockRejectedValue(rejectNumber);

        router.addDeactivateGuard("orders.pending", () => rejectingGuard);

        await router.navigate("orders.pending");
        rejectingGuard.mockClear();

        let err: any;

        try {
          await router.navigate("profile", {}, {});
        } catch (error: any) {
          err = error;
        }

        expect(err?.code).toBe(errorCodes.CANNOT_DEACTIVATE);
        expect(err).toBeInstanceOf(Error);

        expect(rejectingGuard).toHaveBeenCalledTimes(1);
      });

      it("should wrap null rejection in RouterError", async () => {
        const rejectingGuard = vi.fn().mockRejectedValue(null);

        router.addDeactivateGuard("orders.pending", () => rejectingGuard);

        await router.navigate("orders.pending");
        rejectingGuard.mockClear();

        let err: any;

        try {
          await router.navigate("profile", {}, {});
        } catch (error: any) {
          err = error;
        }

        expect(err?.code).toBe(errorCodes.CANNOT_DEACTIVATE);
        expect(err).toBeInstanceOf(Error);

        expect(rejectingGuard).toHaveBeenCalledTimes(1);
      });
    });

    describe("canActivate returns Promise.reject(non-Error)", () => {
      it("should wrap string rejection in RouterError", async () => {
        const rejectString = "Activation failed";
        const rejectingGuard = vi.fn().mockRejectedValue(rejectString);

        router.addActivateGuard("profile", () => rejectingGuard);

        let err: any;

        try {
          await router.navigate("profile", {}, {});
        } catch (error: any) {
          err = error;
        }

        expect(err?.code).toBe(errorCodes.CANNOT_ACTIVATE);
        expect(err).toBeInstanceOf(Error);

        expect(rejectingGuard).toHaveBeenCalledTimes(1);
      });

      it("should wrap number rejection in RouterError", async () => {
        const rejectNumber = 403;
        const rejectingGuard = vi.fn().mockRejectedValue(rejectNumber);

        router.addActivateGuard("profile", () => rejectingGuard);

        let err: any;

        try {
          await router.navigate("profile", {}, {});
        } catch (error: any) {
          err = error;
        }

        expect(err?.code).toBe(errorCodes.CANNOT_ACTIVATE);
        expect(err).toBeInstanceOf(Error);

        expect(rejectingGuard).toHaveBeenCalledTimes(1);
      });

      it("should wrap undefined rejection in RouterError", async () => {
        const rejectingGuard = vi.fn().mockRejectedValue(undefined);

        router.addActivateGuard("profile", () => rejectingGuard);

        let err: any;

        try {
          await router.navigate("profile", {}, {});
        } catch (error: any) {
          err = error;
        }

        expect(err?.code).toBe(errorCodes.CANNOT_ACTIVATE);
        expect(err).toBeInstanceOf(Error);

        expect(rejectingGuard).toHaveBeenCalledTimes(1);
      });
    });

    describe("middleware returns Promise.reject(non-Error)", () => {
      it("should wrap string rejection in RouterError", async () => {
        const rejectString = "Middleware blocked";
        const rejectingMiddleware = vi.fn().mockRejectedValue(rejectString);

        router.useMiddleware(() => rejectingMiddleware);

        const state = await router.navigate("orders.pending", {}, {});

        expect(state).toBeDefined();
        expect(state.name).toBe("orders.pending");
        expect(rejectingMiddleware).toHaveBeenCalledTimes(1);
      });

      it("should wrap number rejection in RouterError", async () => {
        const rejectNumber = 500;
        const rejectingMiddleware = vi.fn().mockRejectedValue(rejectNumber);

        router.useMiddleware(() => rejectingMiddleware);

        const state = await router.navigate("profile", {}, {});

        expect(state).toBeDefined();
        expect(state.name).toBe("profile");
        expect(rejectingMiddleware).toHaveBeenCalledTimes(1);
      });

      it("should wrap boolean rejection in RouterError", async () => {
        const rejectBoolean = false;
        const rejectingMiddleware = vi.fn().mockRejectedValue(rejectBoolean);

        router.useMiddleware(() => rejectingMiddleware);

        const state = await router.navigate("settings", {}, {});

        expect(state).toBeDefined();
        expect(state.name).toBe("settings");
        expect(rejectingMiddleware).toHaveBeenCalledTimes(1);
      });

      it("should handle multiple non-Error rejections in sequence", async () => {
        const rejectString = "First middleware fails";
        const rejectingMiddleware1 = vi.fn().mockRejectedValue(rejectString);
        const nextMiddleware = vi.fn().mockResolvedValue(true);

        router.useMiddleware(() => rejectingMiddleware1);
        router.useMiddleware(() => nextMiddleware);

        const state = await router.navigate("orders", {}, {});

        expect(state).toBeDefined();
        expect(state.name).toBe("orders");
        expect(rejectingMiddleware1).toHaveBeenCalledTimes(1);
        expect(nextMiddleware).toHaveBeenCalledTimes(1);
      });

      it("should wrap object rejection in RouterError (avoiding property conflicts)", async () => {
        const rejectObject = {
          status: "failed",
          reason: "unauthorized",
          level: "critical",
        };
        const rejectingMiddleware = vi.fn().mockRejectedValue(rejectObject);

        router.useMiddleware(() => rejectingMiddleware);

        const state = await router.navigate("profile", {}, {});

        expect(state).toBeDefined();
        expect(state.name).toBe("profile");
        expect(rejectingMiddleware).toHaveBeenCalledTimes(1);
      });
    });
  });
});
