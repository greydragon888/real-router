import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { errorCodes } from "@real-router/core";

import { createTestRouter } from "../../../helpers";

import type { Router } from "@real-router/core";

let router: Router;
const noop = () => undefined;

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
      it("should return ROUTE_NOT_FOUND for consecutive dots (users..view)", () => {
        const callback = vi.fn();

        router.navigate("users..view", {}, {}, callback);

        expect(callback).toHaveBeenCalledWith(
          expect.objectContaining({
            code: errorCodes.ROUTE_NOT_FOUND,
          }),
        );
      });

      it("should return ROUTE_NOT_FOUND for leading dot (.users)", () => {
        const callback = vi.fn();

        router.navigate(".users", {}, {}, callback);

        expect(callback).toHaveBeenCalledWith(
          expect.objectContaining({
            code: errorCodes.ROUTE_NOT_FOUND,
          }),
        );
      });

      it("should return ROUTE_NOT_FOUND for trailing dot (users.)", () => {
        const callback = vi.fn();

        router.navigate("users.", {}, {}, callback);

        expect(callback).toHaveBeenCalledWith(
          expect.objectContaining({
            code: errorCodes.ROUTE_NOT_FOUND,
          }),
        );
      });

      it("should return ROUTE_NOT_FOUND for only dots (..)", () => {
        const callback = vi.fn();

        router.navigate("..", {}, {}, callback);

        expect(callback).toHaveBeenCalledWith(
          expect.objectContaining({
            code: errorCodes.ROUTE_NOT_FOUND,
          }),
        );
      });
    });

    // -------------------------------------------------------------------------
    // 12.3.2 Edge case 2: Array-like objects as params
    // -------------------------------------------------------------------------

    describe("array-like objects as params", () => {
      it("should accept array-like object as params", () => {
        const callback = vi.fn();
        const arrayLikeParams = { length: 2, 0: "a", 1: "b", id: 123 };

        router.navigate(
          "users.view",
          arrayLikeParams as unknown as { id: number },
          {},
          callback,
        );

        expect(callback).toHaveBeenCalledWith(
          undefined,
          expect.objectContaining({
            name: "users.view",
            params: expect.objectContaining({ id: 123 }),
          }),
        );
      });

      it("should handle object with numeric keys", () => {
        const callback = vi.fn();
        const numericKeyParams = { 0: "first", 1: "second", id: 456 };

        router.navigate(
          "users.view",
          numericKeyParams as unknown as { id: number },
          {},
          callback,
        );

        expect(callback).toHaveBeenCalledWith(
          undefined,
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

      it("should call callback when params is null", () => {
        const callback = vi.fn();

        // When paramsOrDone is null, it should be treated as empty params
        // and the callback in position 3 should be called
        // @ts-expect-error - testing runtime behavior with null
        router.navigate("users", null, callback);

        // Callback SHOULD be called with success
        expect(callback).toHaveBeenCalledWith(
          undefined,
          expect.objectContaining({ name: "users", params: {} }),
        );
      });

      it("should call callback when params is undefined", () => {
        const callback = vi.fn();

        // When paramsOrDone is undefined, it should be treated as empty params
        // and the callback in position 3 should be called
        router.navigate("users", undefined, callback);

        // Callback SHOULD be called with success
        expect(callback).toHaveBeenCalledWith(
          undefined,
          expect.objectContaining({ name: "users", params: {} }),
        );
      });

      it("should call callback with 4 args when params is undefined", () => {
        const callback = vi.fn();

        // 4-argument form: navigate(name, params, opts, callback)
        // Even with undefined params, callback should be called
        router.navigate("users", undefined, {}, callback);

        // Callback SHOULD be called
        expect(callback).toHaveBeenCalledWith(
          undefined,
          expect.objectContaining({ name: "users" }),
        );
      });

      it("should call callback with 4 args when params is null", () => {
        const callback = vi.fn();

        // 4-argument form with null params
        // @ts-expect-error - testing runtime behavior with null
        router.navigate("users", null, { replace: true }, callback);

        // Callback SHOULD be called
        expect(callback).toHaveBeenCalledWith(
          undefined,
          expect.objectContaining({ name: "users" }),
        );
      });

      it("should correctly handle empty object {} as params (truthy)", () => {
        const callback = vi.fn();

        // Empty object {} is truthy, so polymorphic parsing works correctly
        router.navigate("users", {}, callback);

        expect(callback).toHaveBeenCalledWith(
          undefined,
          expect.objectContaining({ name: "users" }),
        );
      });

      it("should use empty params when null is passed", () => {
        const callback = vi.fn();

        // @ts-expect-error - testing runtime behavior with null
        router.navigate("users", null, callback);

        // The resulting state should have empty params
        expect(callback).toHaveBeenCalled();

        const [, state] = callback.mock.calls[0] as [
          unknown,
          { params: unknown },
        ];

        expect(state.params).toStrictEqual({});
      });
    });

    // -------------------------------------------------------------------------
    // 12.3.2 Edge case 3: Special numeric values in params
    // -------------------------------------------------------------------------

    describe("special numeric values in params", () => {
      it("should reject NaN in params (not serializable)", () => {
        // NaN is rejected by isParams validation (not finite)
        // This ensures params can be serialized to JSON
        expect(() => {
          router.navigate(
            "users.view",
            { id: Number.NaN as unknown as number },
            {},
            noop,
          );
        }).toThrowError(TypeError);
      });

      it("should reject Infinity in params (not serializable)", () => {
        // Infinity is rejected by isParams validation (not finite)
        expect(() => {
          router.navigate(
            "users.view",
            { id: Infinity as unknown as number },
            {},
            noop,
          );
        }).toThrowError(TypeError);
      });

      it("should reject -Infinity in params (not serializable)", () => {
        expect(() => {
          router.navigate(
            "users.view",
            { id: -Infinity as unknown as number },
            {},
            noop,
          );
        }).toThrowError(TypeError);
      });

      it("should handle -0 in params (finite, converts to '0')", () => {
        const callback = vi.fn();
        const negativeZero = -0;

        // -0 is finite and accepted by isParams
        router.navigate(
          "users.view",
          { id: negativeZero as unknown as number },
          {},
          callback,
        );

        expect(callback).toHaveBeenCalledWith(
          undefined,
          expect.objectContaining({
            // -0 becomes "0" via String(-0)
            path: "/users/view/0",
          }),
        );
      });

      it("should accept regular finite numbers in params", () => {
        const callback = vi.fn();

        router.navigate("users.view", { id: 123 }, {}, callback);

        expect(callback).toHaveBeenCalledWith(
          undefined,
          expect.objectContaining({
            path: "/users/view/123",
          }),
        );
      });
    });
  });
});
