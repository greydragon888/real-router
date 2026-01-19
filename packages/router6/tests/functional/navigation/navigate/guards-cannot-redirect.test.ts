import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { RouterError, errorCodes } from "router6";

import { createTestRouter } from "../../../helpers";

import type { Router } from "router6";

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
      it("should return error when canDeactivate calls done with redirect error", () => {
        router.canDeactivate("users", () => (_toState, _fromState, doneFn) => {
          const error = new RouterError(errorCodes.CANNOT_DEACTIVATE, {
            redirect: {
              name: "orders.pending",
              params: {},
              path: "/orders/pending",
            },
          });

          doneFn(error);
        });

        router.navigate("users");

        router.navigate("profile", (err) => {
          // Guards cannot redirect - should return error
          expect(err?.code).toBe(errorCodes.CANNOT_DEACTIVATE);
        });

        // Should remain on users
        expect(router.getState()?.name).toBe("users");
      });

      it("should return error when canDeactivate returns different route state", () => {
        router.canDeactivate("users", () => () => {
          return { name: "sign-in", params: {}, path: "/sign-in" };
        });

        router.navigate("users");

        router.navigate("profile", (err) => {
          // Guards cannot redirect - should return error
          expect(err?.code).toBe(errorCodes.CANNOT_DEACTIVATE);
          expect(
            (err?.attemptedRedirect as { name: string } | undefined)?.name,
          ).toBe("sign-in");
        });

        // Should remain on users
        expect(router.getState()?.name).toBe("users");
      });
    });

    describe("canActivate returns error when attempting redirect", () => {
      it("should return error when canActivate calls done with redirect error", () => {
        router.canActivate("profile", () => (_toState, _fromState, doneFn) => {
          const error = new RouterError(errorCodes.CANNOT_ACTIVATE, {
            redirect: { name: "sign-in", params: {}, path: "/sign-in" },
          });

          doneFn(error);
        });

        router.navigate("users");

        router.navigate("profile", (err) => {
          // Guards cannot redirect - should return error
          expect(err?.code).toBe(errorCodes.CANNOT_ACTIVATE);
        });
      });

      it("should return error when canActivate returns different route state", () => {
        router.canActivate("users.view", () => () => {
          return {
            name: "orders.view",
            params: { id: 42 },
            path: "/orders/view/42",
          };
        });

        router.navigate("index");

        router.navigate("users.view", { id: 123 }, (err) => {
          // Guards cannot redirect - should return error
          expect(err?.code).toBe(errorCodes.CANNOT_ACTIVATE);
          expect(
            (err?.attemptedRedirect as { name: string } | undefined)?.name,
          ).toBe("orders.view");
        });
      });

      it("should return error for Promise-based canActivate redirect via rejection", async () => {
        vi.useFakeTimers();

        router.canActivate("profile", () => () => {
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

        router.navigate("profile", callback);

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

        router.canActivate("profile", () => () => {
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

        router.navigate("profile", callback);

        await vi.runAllTimersAsync();

        // Guards cannot redirect - should return error
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
        const result = await new Promise<{ err: any; state: any }>(
          (resolve) => {
            router.start("/auth-protected", (err, state) => {
              resolve({ err, state });
            });
          },
        );

        // The auth-protected route guard returns redirect, but guards cannot redirect
        // So it should return error or fallback to default route
        expect(result.err !== undefined || result.state?.name === "home").toBe(
          true,
        );
      });
    });

    describe("guards blocking (not redirecting)", () => {
      it("should block with false return", () => {
        router.canActivate("admin", () => () => false);

        router.navigate("users");

        router.navigate("admin", (err) => {
          expect(err?.code).toBe(errorCodes.CANNOT_ACTIVATE);
        });

        expect(router.getState()?.name).toBe("users");
      });

      it("should block with error throw", () => {
        router.canActivate("admin", () => () => {
          throw new RouterError(errorCodes.CANNOT_ACTIVATE, {
            message: "Access denied",
          });
        });

        router.navigate("users");

        router.navigate("admin", (err) => {
          expect(err?.code).toBe(errorCodes.CANNOT_ACTIVATE);
        });
      });
    });
  });

  describe("Issue #34: Guards cannot redirect (redesigned)", () => {
    // Issue #34 was about stack overflow when canDeactivate returned redirect.
    // The solution: Guards cannot redirect at all. They return errors instead.

    it("should return error when canDeactivate returns redirect (guards cannot redirect)", async () => {
      router.navigate("users");

      router.canDeactivate("users", () => (_toState, _fromState, done) => {
        const error = new RouterError(errorCodes.CANNOT_DEACTIVATE, {
          redirect: { name: "sign-in", params: {}, path: "/sign-in" },
        });

        done(error);
      });

      const result = await new Promise<{ err: any; state: any }>((resolve) => {
        router.navigate("profile", (err, state) => {
          resolve({ err, state });
        });
      });

      // Guards cannot redirect - error should be returned
      expect(result.err).toBeDefined();
      expect(result.err?.code).toBe(errorCodes.CANNOT_DEACTIVATE);
      // State should remain on users
      expect(router.getState()?.name).toBe("users");
    });

    it("should remain on current route when canDeactivate blocks with redirect", async () => {
      router.navigate("users");

      router.canDeactivate("users", () => () => ({
        name: "sign-in",
        params: {},
        path: "/sign-in",
      }));

      const result = await new Promise<{ err: any; state: any }>((resolve) => {
        router.navigate("profile", (err, state) => {
          resolve({ err, state });
        });
      });

      // Guards cannot redirect - should return error
      expect(result.err?.code).toBe(errorCodes.CANNOT_DEACTIVATE);
      expect(result.err?.attemptedRedirect?.name).toBe("sign-in");
      // Should remain on users
      expect(router.getState()?.name).toBe("users");
    });
  });

  describe("Issue #35: Guards cannot redirect to different routes", () => {
    // Issue #35 was about state-based redirects bypassing guards.
    // The solution: Guards cannot redirect at all - they return errors instead.

    // Test 1: canDeactivate returning different state returns error
    it("should return error when canDeactivate returns different route state", async () => {
      router.canDeactivate("users", () => () => ({
        name: "admin",
        params: {},
        path: "/admin",
      }));

      router.navigate("users");

      const result = await new Promise<{ err: any; state: any }>((resolve) => {
        router.navigate("profile", (err, state) => {
          resolve({ err, state });
        });
      });

      // Guards cannot redirect - should return error
      expect(result.err?.code).toBe(errorCodes.CANNOT_DEACTIVATE);
      expect(result.err?.attemptedRedirect?.name).toBe("admin");
      // Should remain on users
      expect(router.getState()?.name).toBe("users");
    });

    // Test 2: canActivate returning different state returns error
    it("should return error when canActivate returns different route state", async () => {
      router.canActivate("users", () => () => ({
        name: "profile",
        params: {},
        path: "/profile",
      }));

      const result = await new Promise<{ err: any; state: any }>((resolve) => {
        router.navigate("users", (err, state) => {
          resolve({ err, state });
        });
      });

      // Guards cannot redirect - should return error
      expect(result.err?.code).toBe(errorCodes.CANNOT_ACTIVATE);
      expect(result.err?.attemptedRedirect?.name).toBe("profile");
    });

    // Test 3: Same route state modification should NOT trigger re-navigation
    it("should allow guards to modify meta without re-navigation", async () => {
      router.canActivate("users.view", () => (toState, _fromState, done) => {
        // Modify meta and continue - same route, should just merge
        done(undefined, {
          ...toState,
          meta: { ...toState.meta, normalized: true } as any,
        });
      });

      const result = await new Promise<{ err: any; state: any }>((resolve) => {
        router.navigate("users.view", { id: "123" }, (err, state) => {
          resolve({ err, state });
        });
      });

      expect(result.err).toBeUndefined();
      expect(result.state?.meta?.normalized).toBe(true);
      expect(result.state?.name).toBe("users.view");
    });

    // Test 4: Protected route blocks access
    it("should block access to protected route", async () => {
      router.canActivate("admin", () => () => false);

      router.navigate("users");

      const result = await new Promise<{ err: any; state: any }>((resolve) => {
        router.navigate("admin", (err, state) => {
          resolve({ err, state });
        });
      });

      // Should be blocked
      expect(result.err?.code).toBe(errorCodes.CANNOT_ACTIVATE);
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

        freshRouter.canActivate("users", () => (_toState, _fromState, done) => {
          done(
            new RouterError(errorCodes.CANNOT_ACTIVATE, {
              redirect: { name: "orders", params: {}, path: "/orders" },
            }),
          );
        });

        const result = await new Promise<{ err: any; state: any }>(
          (resolve) => {
            freshRouter.navigate("users", (err, state) => {
              resolve({ err, state });
            });
          },
        );

        // Guard cannot redirect - should return error
        expect(result.err).toBeDefined();
        expect(result.err?.code).toBe(errorCodes.CANNOT_ACTIVATE);

        freshRouter.stop();
      });

      it("should return error when canActivate returns state-based redirect", async () => {
        const freshRouter = createTestRouter();

        freshRouter.start();

        freshRouter.canActivate("users", () => () => ({
          name: "orders",
          params: {},
          path: "/orders",
        }));

        const result = await new Promise<{ err: any; state: any }>(
          (resolve) => {
            freshRouter.navigate("users", (err, state) => {
              resolve({ err, state });
            });
          },
        );

        // Guard cannot redirect - should return error with attemptedRedirect info
        expect(result.err?.code).toBe(errorCodes.CANNOT_ACTIVATE);
        expect(result.err?.attemptedRedirect?.name).toBe("orders");

        freshRouter.stop();
      });

      it("should allow guards to block without redirect", async () => {
        const freshRouter = createTestRouter();

        freshRouter.start();

        freshRouter.canActivate("admin", () => () => false);

        const result = await new Promise<{ err: any; state: any }>(
          (resolve) => {
            freshRouter.navigate("admin", (err, state) => {
              resolve({ err, state });
            });
          },
        );

        expect(result.err?.code).toBe(errorCodes.CANNOT_ACTIVATE);

        freshRouter.stop();
      });
    });
  });

  /**
   * Issue #52: Recursive event listeners execute unintended side-effect listeners
   * https://github.com/greydragon888/router6/issues/52
   *
   * Problem: When a listener triggers navigation (redirect), ALL listeners execute
   * at each recursion level, including side-effect listeners (analytics, logging)
   * that should only fire for the final navigation result.
   *
   * Current behavior: Side-effect listeners fire for BOTH intermediate and final states
   * Expected behavior: Side-effect listeners fire ONLY for final navigation result
   */
});
