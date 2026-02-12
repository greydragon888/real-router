import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { RouterError, errorCodes } from "@real-router/core";

import { createTestRouter } from "../../../helpers";

import type { Router } from "@real-router/core";

let router: Router;

describe("router.navigate() - guards cannot redirect", () => {
  beforeEach(() => {
    router = createTestRouter();

    router.start();
  });

  afterEach(() => {
    router.stop();

    vi.clearAllMocks();
  });

  describe("guards cannot redirect (return errors instead)", () => {
    // After Issue #55 fix: guards cannot redirect, they return errors instead.
    // This section tests that behavior.

    describe("canDeactivate returns error when attempting redirect", () => {
      it("should return error when canDeactivate calls done with redirect error", async () => {
        router.addDeactivateGuard("users", () => () => {
          throw new RouterError(errorCodes.CANNOT_DEACTIVATE, {
            redirect: {
              name: "orders.pending",
              params: {},
              path: "/orders/pending",
            },
          });
        });

        await router.navigate("users");

        try {
          await router.navigate("profile");
          expect.fail("Should have thrown error");
        } catch (err: any) {
          // Guards cannot redirect - should return error
          expect(err?.code).toBe(errorCodes.CANNOT_DEACTIVATE);
        }

        // Should remain on users
        expect(router.getState()?.name).toBe("users");
      });

      it("should return error when canDeactivate returns different route state", async () => {
        router.addDeactivateGuard("users", () => () => {
          return { name: "sign-in", params: {}, path: "/sign-in" };
        });

        await router.navigate("users");

        try {
          await router.navigate("profile");
          expect.fail("Should have thrown error");
        } catch (err: any) {
          // Guards cannot redirect - should return error
          expect(err?.code).toBe(errorCodes.CANNOT_DEACTIVATE);
          expect(
            (err?.attemptedRedirect as { name: string } | undefined)?.name,
          ).toBe("sign-in");
        }

        // Should remain on users
        expect(router.getState()?.name).toBe("users");
      });
    });

    describe("canActivate returns error when attempting redirect", () => {
      it("should return error when canActivate calls done with redirect error", async () => {
        router.addActivateGuard("profile", () => () => {
          throw new RouterError(errorCodes.CANNOT_ACTIVATE, {
            redirect: { name: "sign-in", params: {}, path: "/sign-in" },
          });
        });

        await router.navigate("users");

        try {
          await router.navigate("profile");
          expect.fail("Should have thrown error");
        } catch (err: any) {
          // Guards cannot redirect - should return error
          expect(err?.code).toBe(errorCodes.CANNOT_ACTIVATE);
        }
      });

      it("should return error when canActivate returns different route state", async () => {
        router.addActivateGuard("users.view", () => () => {
          return {
            name: "orders.view",
            params: { id: 42 },
            path: "/orders/view/42",
          };
        });

        await router.navigate("index");

        try {
          await router.navigate("users.view", { id: 123 });
          expect.fail("Should have thrown error");
        } catch (err: any) {
          // Guards cannot redirect - should return error
          expect(err?.code).toBe(errorCodes.CANNOT_ACTIVATE);
          expect(
            (err?.attemptedRedirect as { name: string } | undefined)?.name,
          ).toBe("orders.view");
        }
      });

      it("should return error for Promise-based canActivate redirect via rejection", async () => {
        vi.useFakeTimers();

        router.addActivateGuard("profile", () => () => {
          return new Promise((_resolve, reject) => {
            setTimeout(() => {
              const error = new RouterError(errorCodes.CANNOT_ACTIVATE, {
                redirect: { name: "sign-in", params: {}, path: "/sign-in" },
              });

              reject(error);
            }, 100);
          });
        });

        router.navigate("index");

        const callback = vi.fn();

        router.navigate("profile", {}, {}).then(callback).catch(callback);

        await vi.runAllTimersAsync();

        expect(callback).toHaveBeenCalledWith(
          expect.objectContaining({
            code: errorCodes.CANNOT_ACTIVATE,
          }),
        );

        vi.useRealTimers();
      });

      it("should return error for Promise-based canActivate returning different route", async () => {
        vi.useFakeTimers();

        router.addActivateGuard("profile", () => () => {
          return new Promise((resolve) => {
            setTimeout(() => {
              resolve({
                name: "sign-in",
                params: {},
                path: "/sign-in",
              });
            }, 10);
          });
        });

        router.navigate("index");

        const callback = vi.fn();

        router.navigate("profile", {}, {}).then(callback).catch(callback);

        await vi.runAllTimersAsync();

        expect(callback).toHaveBeenCalledWith(
          expect.objectContaining({
            code: errorCodes.CANNOT_ACTIVATE,
          }),
        );

        vi.useRealTimers();
      });

      it("should return error for auth-protected routes", async () => {
        router.stop();

        // Start router with auth-protected path - should fail with error
        try {
          const state = await router.start("/auth-protected");

          // If we reach here, it should have fallen back to default route
          expect(state?.name).toBe("home");
        } catch (error: any) {
          // Or it should have returned an error
          expect(error).toBeDefined();
        }
      });
    });

    describe("guards blocking (not redirecting)", () => {
      it("should block with false return", async () => {
        router.addActivateGuard("admin", () => () => false);

        await router.navigate("users");

        try {
          await router.navigate("admin");

          expect.fail("Should have thrown error");
        } catch (error: any) {
          expect(error?.code).toBe(errorCodes.CANNOT_ACTIVATE);
        }

        expect(router.getState()?.name).toBe("users");
      });

      it("should block with error throw", async () => {
        router.addActivateGuard("admin", () => () => {
          throw new RouterError(errorCodes.CANNOT_ACTIVATE, {
            message: "Access denied",
          });
        });

        await router.navigate("users");

        try {
          await router.navigate("admin");

          expect.fail("Should have thrown error");
        } catch (error: any) {
          expect(error?.code).toBe(errorCodes.CANNOT_ACTIVATE);
        }
      });
    });
  });

  describe("Issue #34: Guards cannot redirect (redesigned)", () => {
    // Issue #34 was about stack overflow when canDeactivate returned redirect.
    // The solution: Guards cannot redirect at all. They return errors instead.

    it("should return error when canDeactivate returns redirect (guards cannot redirect)", async () => {
      await router.navigate("users");

      router.addDeactivateGuard("users", () => () => {
        throw new RouterError(errorCodes.CANNOT_DEACTIVATE, {
          redirect: { name: "sign-in", params: {}, path: "/sign-in" },
        });
      });

      try {
        await router.navigate("profile");

        expect.fail("Should have thrown error");
      } catch (error: any) {
        expect(error).toBeDefined();
        expect(error.code).toBe(errorCodes.CANNOT_DEACTIVATE);
      }

      expect(router.getState()?.name).toBe("users");
    });

    it("should remain on current route when canDeactivate blocks with redirect", async () => {
      await router.navigate("users");

      router.addDeactivateGuard("users", () => () => ({
        name: "sign-in",
        params: {},
        path: "/sign-in",
      }));

      try {
        await router.navigate("profile");

        expect.fail("Should have thrown error");
      } catch (error: any) {
        expect(error.code).toBe(errorCodes.CANNOT_DEACTIVATE);
        expect(error.attemptedRedirect?.name).toBe("sign-in");
      }

      expect(router.getState()?.name).toBe("users");
    });
  });

  describe("Issue #35: Guards cannot redirect to different routes", () => {
    // Issue #35 was about state-based redirects bypassing guards.
    // The solution: Guards cannot redirect at all - they return errors instead.

    // Test 1: canDeactivate returning different state returns error
    it("should return error when canDeactivate returns different route state", async () => {
      router.addDeactivateGuard("users", () => () => ({
        name: "admin",
        params: {},
        path: "/admin",
      }));

      await router.navigate("users");

      try {
        await router.navigate("profile");

        expect.fail("Should have thrown error");
      } catch (error: any) {
        expect(error.code).toBe(errorCodes.CANNOT_DEACTIVATE);
        expect(error.attemptedRedirect?.name).toBe("admin");
      }

      expect(router.getState()?.name).toBe("users");
    });

    // Test 2: canActivate returning different state returns error
    it("should return error when canActivate returns different route state", async () => {
      router.addActivateGuard("users", () => () => ({
        name: "profile",
        params: {},
        path: "/profile",
      }));

      try {
        await router.navigate("users");

        expect.fail("Should have thrown error");
      } catch (error: any) {
        expect(error.code).toBe(errorCodes.CANNOT_ACTIVATE);
        expect(error.attemptedRedirect?.name).toBe("profile");
      }
    });

    it("should allow navigation when guard returns true", async () => {
      router.addActivateGuard("users.view", () => () => {
        return true;
      });

      const state = await router.navigate("users.view", { id: "123" });

      expect(state?.name).toBe("users.view");
    });

    // Test 4: Protected route blocks access
    it("should block access to protected route", async () => {
      router.addActivateGuard("admin", () => () => false);

      await router.navigate("users");

      try {
        await router.navigate("admin");

        expect.fail("Should have thrown error");
      } catch (error: any) {
        expect(error.code).toBe(errorCodes.CANNOT_ACTIVATE);
      }

      expect(router.getState()?.name).not.toBe("admin");
    });
  });

  describe("Issue #55: Guards cannot redirect (no infinite loops)", () => {
    // Issue #55 was about infinite redirect loops from canActivate guards.
    // The solution: Guards cannot redirect at all. They return errors instead.
    // This completely eliminates the possibility of infinite redirect loops.

    describe("Guards return errors instead of redirecting", () => {
      it("should return error when canActivate attempts to redirect", async () => {
        const freshRouter = createTestRouter();

        freshRouter.start();

        freshRouter.addActivateGuard("users", () => () => {
          throw new RouterError(errorCodes.CANNOT_ACTIVATE, {
            redirect: { name: "orders", params: {}, path: "/orders" },
          });
        });

        try {
          await freshRouter.navigate("users");

          expect.fail("Should have thrown error");
        } catch (error: any) {
          expect(error).toBeDefined();
          expect(error.code).toBe(errorCodes.CANNOT_ACTIVATE);
        }

        freshRouter.stop();
      });

      it("should return error when canActivate returns state-based redirect", async () => {
        const freshRouter = createTestRouter();

        freshRouter.start();

        freshRouter.addActivateGuard("users", () => () => ({
          name: "orders",
          params: {},
          path: "/orders",
        }));

        try {
          await freshRouter.navigate("users");

          expect.fail("Should have thrown error");
        } catch (error: any) {
          expect(error.code).toBe(errorCodes.CANNOT_ACTIVATE);
          expect(error.attemptedRedirect?.name).toBe("orders");
        }

        freshRouter.stop();
      });

      it("should allow guards to block without redirect", async () => {
        const freshRouter = createTestRouter();

        freshRouter.start();

        freshRouter.addActivateGuard("admin", () => () => false);

        try {
          await freshRouter.navigate("admin");

          expect.fail("Should have thrown error");
        } catch (error: any) {
          expect(error.code).toBe(errorCodes.CANNOT_ACTIVATE);
        }

        freshRouter.stop();
      });
    });
  });

  /**
   * IRecursive event listeners execute unintended side-effect listeners
   *
   * Problem: When a listener triggers navigation (redirect), ALL listeners execute
   * at each recursion level, including side-effect listeners (analytics, logging)
   * that should only fire for the final navigation result.
   *
   * Current behavior: Side-effect listeners fire for BOTH intermediate and final states
   * Expected behavior: Side-effect listeners fire ONLY for final navigation result
   */
});
