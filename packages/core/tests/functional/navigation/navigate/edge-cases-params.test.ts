import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { errorCodes } from "@real-router/core";

import { createTestRouter } from "../../../helpers";

import type { Router } from "@real-router/core";

let router: Router;

describe("router.navigate() - edge cases params", () => {
  beforeEach(() => {
    router = createTestRouter();

    router.start();
  });

  afterEach(() => {
    router.stop();

    vi.clearAllMocks();
  });

  describe("edge cases - section 12 analysis", () => {
    describe("dot-notation edge cases", () => {
      it("should return ROUTE_NOT_FOUND for consecutive dots (users..view)", async () => {
        try {
          await router.navigate("users..view", {}, {});

          expect.fail("Should have thrown error");
        } catch (error) {
          expect((error as any)?.code).toBe(errorCodes.ROUTE_NOT_FOUND);
        }
      });

      it("should return ROUTE_NOT_FOUND for leading dot (.users)", async () => {
        try {
          await router.navigate(".users", {}, {});

          expect.fail("Should have thrown error");
        } catch (error) {
          expect((error as any)?.code).toBe(errorCodes.ROUTE_NOT_FOUND);
        }
      });

      it("should return ROUTE_NOT_FOUND for trailing dot (users.)", async () => {
        try {
          await router.navigate("users.", {}, {});

          expect.fail("Should have thrown error");
        } catch (error) {
          expect((error as any)?.code).toBe(errorCodes.ROUTE_NOT_FOUND);
        }
      });

      it("should return ROUTE_NOT_FOUND for only dots (..)", async () => {
        try {
          await router.navigate("..", {}, {});

          expect.fail("Should have thrown error");
        } catch (error) {
          expect((error as any)?.code).toBe(errorCodes.ROUTE_NOT_FOUND);
        }
      });
    });

    // -------------------------------------------------------------------------
    // 12.3.2 Edge case 2: Array-like objects as params
    // -------------------------------------------------------------------------

    describe("array-like objects as params", () => {
      it("should accept array-like object as params", async () => {
        const arrayLikeParams = { length: 2, 0: "a", 1: "b", id: 123 };

        const state = await router.navigate(
          "users.view",
          arrayLikeParams as unknown as { id: number },
          {},
        );

        expect(state).toEqual(
          expect.objectContaining({
            name: "users.view",
            params: expect.objectContaining({ id: 123 }),
          }),
        );
      });

      it("should handle object with numeric keys", async () => {
        const numericKeyParams = { 0: "first", 1: "second", id: 456 };

        const state = await router.navigate(
          "users.view",
          numericKeyParams as unknown as { id: number },
          {},
        );

        expect(state).toEqual(
          expect.objectContaining({
            name: "users.view",
            params: expect.objectContaining({ id: 456 }),
          }),
        );
      });
    });

    // -------------------------------------------------------------------------
    // 12.3.3 Edge case 1: Throwing getter in opts
    // -------------------------------------------------------------------------

    describe("null and undefined params handling", () => {
      // TDD tests: These test the CORRECT expected behavior after the fix
      // The polymorphic logic should correctly handle falsy params values

      it("should call callback when params is null", async () => {
        // When paramsOrDone is null, it should be treated as empty params
        // and the callback in position 3 should be called
        // @ts-expect-error - testing runtime behavior with null
        const state = await router.navigate("users", null);

        // Callback SHOULD be called with success
        expect(state).toEqual(
          expect.objectContaining({ name: "users", params: {} }),
        );
      });

      it("should call callback when params is undefined", async () => {
        // When paramsOrDone is undefined, it should be treated as empty params
        // and the callback in position 3 should be called
        const state = await router.navigate("users");

        // Callback SHOULD be called with success
        expect(state).toEqual(
          expect.objectContaining({ name: "users", params: {} }),
        );
      });

      it("should call callback with 4 args when params is undefined", async () => {
        // 4-argument form: navigate(name, params, opts, callback)
        // Even with undefined params, callback should be called
        const state = await router.navigate("users", {});

        // Callback SHOULD be called
        expect(state).toEqual(expect.objectContaining({ name: "users" }));
      });

      it("should call callback with 4 args when params is null", async () => {
        // 4-argument form with null params
        // @ts-expect-error - testing runtime behavior with null
        const state = await router.navigate("users", null, { replace: true });

        // Callback SHOULD be called
        expect(state).toEqual(expect.objectContaining({ name: "users" }));
      });

      it("should correctly handle empty object {} as params (truthy)", async () => {
        // Empty object {} is truthy, so polymorphic parsing works correctly
        const state = await router.navigate("users", {});

        expect(state).toEqual(expect.objectContaining({ name: "users" }));
      });

      it("should use empty params when null is passed", async () => {
        // @ts-expect-error - testing runtime behavior with null
        const state = await router.navigate("users", null);

        // The resulting state should have empty params
        expect(state.params).toStrictEqual({});
      });
    });

    // -------------------------------------------------------------------------
    // 12.3.2 Edge case 3: Special numeric values in params
    // -------------------------------------------------------------------------

    describe("special numeric values in params", () => {
      it("should reject NaN in params (not serializable)", async () => {
        // NaN is rejected by isParams validation (not finite)
        // This ensures params can be serialized to JSON
        expect(() => {
          router.navigate(
            "users.view",
            { id: Number.NaN as unknown as number },
            {},
          );
        }).toThrowError(TypeError);
      });

      it("should reject Infinity in params (not serializable)", async () => {
        // Infinity is rejected by isParams validation (not finite)
        expect(() => {
          router.navigate(
            "users.view",
            { id: Infinity as unknown as number },
            {},
          );
        }).toThrowError(TypeError);
      });

      it("should reject -Infinity in params (not serializable)", async () => {
        expect(() => {
          router.navigate(
            "users.view",
            { id: -Infinity as unknown as number },
            {},
          );
        }).toThrowError(TypeError);
      });

      it("should handle -0 in params (finite, converts to '0')", async () => {
        const negativeZero = -0;

        // -0 is finite and accepted by isParams
        const state = await router.navigate(
          "users.view",
          { id: negativeZero as unknown as number },
          {},
        );

        expect(state).toEqual(
          expect.objectContaining({
            // -0 becomes "0" via String(-0)
            path: "/users/view/0",
          }),
        );
      });

      it("should accept regular finite numbers in params", async () => {
        const state = await router.navigate("users.view", { id: 123 }, {});

        expect(state).toEqual(
          expect.objectContaining({
            path: "/users/view/123",
          }),
        );
      });
    });
  });
});
