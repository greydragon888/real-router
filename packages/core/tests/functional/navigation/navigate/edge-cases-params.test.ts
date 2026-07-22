import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { errorCodes } from "@real-router/core";

import { createTestRouter } from "../../../helpers";

import type { Router } from "@real-router/core";

let router: Router;

describe("router.navigate() - edge cases params", () => {
  beforeEach(async () => {
    router = createTestRouter();

    await router.start("/home");
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

        const state = await router.navigate("users.view", arrayLikeParams, {});

        expect(state.name).toBe("users.view");
        // `id` fills the `:id` path slot (stays in .params); the undeclared
        // keys are captured as query params (re-channeled to .search).
        expect(state.params).toStrictEqual({
          id: 123,
        });
        expect(state.search).toStrictEqual({
          length: 2,
          0: "a",
          1: "b",
        });
      });

      it("should handle object with numeric keys", async () => {
        const numericKeyParams = { 0: "first", 1: "second", id: 456 };

        const state = await router.navigate("users.view", numericKeyParams, {});

        expect(state.name).toBe("users.view");
        // `id` fills the `:id` path slot (stays in .params); the undeclared
        // numeric keys are captured as query params (re-channeled to .search).
        expect(state.params).toStrictEqual({
          id: 456,
        });
        expect(state.search).toStrictEqual({
          0: "first",
          1: "second",
        });
      });
    });

    // -------------------------------------------------------------------------
    // 12.3.3 Edge case 1: Throwing getter in opts
    // -------------------------------------------------------------------------

    describe("null and undefined params handling", () => {
      // The polymorphic argument logic must treat falsy `params` (null /
      // undefined) as empty params and resolve normally. (Titles formerly
      // referenced a `callback` argument — that API was removed; navigate() is
      // Promise-only.)

      it("treats null params as empty params and resolves", async () => {
        // @ts-expect-error - testing runtime behavior with null
        const state = await router.navigate("users", null);

        expect(state).toStrictEqual(
          expect.objectContaining({ name: "users", params: {} }),
        );
      });

      it("treats undefined params as empty params and resolves", async () => {
        const state = await router.navigate("users");

        expect(state).toStrictEqual(
          expect.objectContaining({ name: "users", params: {} }),
        );
      });

      it("resolves with empty params object: navigate(name, {})", async () => {
        const state = await router.navigate("users", {});

        expect(state).toStrictEqual(expect.objectContaining({ name: "users" }));
      });

      it("honors opts when params is null: navigate(name, null, { replace: true })", async () => {
        // @ts-expect-error - testing runtime behavior with null
        const state = await router.navigate("users", null, { replace: true });

        expect(state).toStrictEqual(expect.objectContaining({ name: "users" }));
        // null params must not swallow the opts — `replace` must still apply.
        expect(state.transition?.replace).toBe(true);
      });

      it("should correctly handle empty object {} as params (truthy)", async () => {
        // Empty object {} is truthy, so polymorphic parsing works correctly
        const state = await router.navigate("users", {});

        expect(state).toStrictEqual(expect.objectContaining({ name: "users" }));
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
      it("should handle -0 in params (finite, converts to '0')", async () => {
        const negativeZero = -0;

        // -0 is finite and accepted by isParams
        const state = await router.navigate(
          "users.view",
          { id: negativeZero as unknown as number },
          {},
        );

        expect(state).toStrictEqual(
          expect.objectContaining({
            // -0 becomes "0" via String(-0)
            path: "/users/view/0",
          }),
        );
      });

      it("should accept regular finite numbers in params", async () => {
        const state = await router.navigate("users.view", { id: 123 }, {});

        expect(state).toStrictEqual(
          expect.objectContaining({
            path: "/users/view/123",
          }),
        );
      });
    });
  });
});
