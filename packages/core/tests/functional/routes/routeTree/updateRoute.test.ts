import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { errorCodes } from "@real-router/core";

import { createTestRouter } from "../../../helpers";

import type {
  Router,
  ActivationFnFactory,
  Params,
  RouterError,
} from "@real-router/core";

let router: Router;

describe("core/routes/routeTree/updateRoute", () => {
  beforeEach(() => {
    router = createTestRouter();
    router.start();
  });

  afterEach(() => {
    router.stop();
  });

  describe("forwardTo", () => {
    it("should add forwardTo", () => {
      router.addRoute({ name: "ur-source", path: "/ur-source" });
      router.addRoute({ name: "ur-target", path: "/ur-target" });

      router.updateRoute("ur-source", { forwardTo: "ur-target" });

      // Verify forward works via behavior
      expect(router.forwardState("ur-source", {}).name).toBe("ur-target");
    });

    it("should update existing forwardTo", () => {
      router.addRoute({ name: "ur-src", path: "/ur-src" });
      router.addRoute({ name: "ur-target1", path: "/ur-target1" });
      router.addRoute({ name: "ur-target2", path: "/ur-target2" });
      router.updateRoute("ur-src", { forwardTo: "ur-target1" });

      router.updateRoute("ur-src", { forwardTo: "ur-target2" });

      // Verify updated forward works
      expect(router.forwardState("ur-src", {}).name).toBe("ur-target2");
    });

    it("should remove forwardTo when null", () => {
      router.addRoute({ name: "ur-dest", path: "/ur-dest" });
      router.addRoute({
        name: "ur-origin",
        path: "/ur-origin",
        forwardTo: "ur-dest",
      });

      router.updateRoute("ur-origin", { forwardTo: null });

      // Forward should no longer redirect
      expect(router.forwardState("ur-origin", {}).name).toBe("ur-origin");
    });

    it("should throw if target does not exist", () => {
      router.addRoute({ name: "ur-from", path: "/ur-from" });

      expect(() =>
        router.updateRoute("ur-from", { forwardTo: "nonexistent" }),
      ).toThrowError(
        '[real-router] updateRoute: forwardTo target "nonexistent" does not exist',
      );
    });

    it("should throw if creates direct cycle", () => {
      router.addRoute({ name: "ur-self", path: "/ur-self" });

      expect(() =>
        router.updateRoute("ur-self", { forwardTo: "ur-self" }),
      ).toThrowError(/Circular forwardTo/);
    });

    it("should throw if target requires unavailable params", () => {
      router.addRoute({ name: "ur-static", path: "/ur-static" });
      router.addRoute({ name: "ur-param", path: "/ur-param/:id" });

      expect(() =>
        router.updateRoute("ur-static", { forwardTo: "ur-param" }),
      ).toThrowError(
        '[real-router] forwardTo target "ur-param" requires params [id] that are not available in source route "ur-static"',
      );
    });

    it("should allow forwardTo when params match", () => {
      router.addRoute({ name: "ur-old", path: "/ur-old/:id" });
      router.addRoute({ name: "ur-new", path: "/ur-new/:id" });

      expect(() =>
        router.updateRoute("ur-old", { forwardTo: "ur-new" }),
      ).not.toThrowError();

      // Verify forward works via behavior
      expect(router.forwardState("ur-old", { id: "1" }).name).toBe("ur-new");
    });

    it("should work with matchPath after update", () => {
      router.addRoute({ name: "ur-alias", path: "/ur-alias/:id" });
      router.addRoute({ name: "ur-real", path: "/ur-real/:id" });
      router.updateRoute("ur-alias", { forwardTo: "ur-real" });

      const state = router.matchPath("/ur-alias/123");

      expect(state?.name).toBe("ur-real");
      expect(state?.params.id).toBe("123");
    });

    describe("indirect cycle detection", () => {
      it("should not corrupt forwardMap on indirect cycle (A → B → C → A)", () => {
        router.addRoute({ name: "ur-a", path: "/ur-a" });
        router.addRoute({ name: "ur-b", path: "/ur-b" });
        router.addRoute({ name: "ur-c", path: "/ur-c" });

        router.updateRoute("ur-a", { forwardTo: "ur-b" });
        router.updateRoute("ur-b", { forwardTo: "ur-c" });

        // Should throw error AND NOT corrupt forwardMap
        expect(() =>
          router.updateRoute("ur-c", { forwardTo: "ur-a" }),
        ).toThrowError(/Circular forwardTo/);

        // forwardMap should remain clean (without ur-c) - verify via behavior
        expect(router.forwardState("ur-a", {}).name).toBe("ur-c"); // ur-a → ur-b → ur-c
        expect(router.forwardState("ur-b", {}).name).toBe("ur-c"); // ur-b → ur-c
        expect(router.forwardState("ur-c", {}).name).toBe("ur-c"); // ur-c stays (no forward)
      });

      it("should not corrupt forwardMap on longer indirect cycle (A → B → C → D → A)", () => {
        router.addRoute({ name: "ur-x", path: "/ur-x" });
        router.addRoute({ name: "ur-y", path: "/ur-y" });
        router.addRoute({ name: "ur-z", path: "/ur-z" });
        router.addRoute({ name: "ur-w", path: "/ur-w" });

        router.updateRoute("ur-x", { forwardTo: "ur-y" });
        router.updateRoute("ur-y", { forwardTo: "ur-z" });
        router.updateRoute("ur-z", { forwardTo: "ur-w" });

        expect(() =>
          router.updateRoute("ur-w", { forwardTo: "ur-x" }),
        ).toThrowError(/Circular forwardTo/);

        // forwardMap should remain without ur-w → ur-x - verify via behavior
        expect(router.forwardState("ur-w", {}).name).toBe("ur-w"); // ur-w stays (no forward)
      });

      it("should preserve resolvedForwardMap consistency after cycle rejection", () => {
        router.addRoute({ name: "ur-p", path: "/ur-p" });
        router.addRoute({ name: "ur-q", path: "/ur-q" });
        router.addRoute({ name: "ur-r", path: "/ur-r" });

        router.updateRoute("ur-p", { forwardTo: "ur-q" });
        router.updateRoute("ur-q", { forwardTo: "ur-r" });

        // Attempt to create cycle
        expect(() =>
          router.updateRoute("ur-r", { forwardTo: "ur-p" }),
        ).toThrowError();

        // matchPath should work correctly with existing redirects
        const state = router.matchPath("/ur-p");

        expect(state?.name).toBe("ur-r"); // ur-p → ur-q → ur-r
      });

      it("should throw if forward chain exceeds maximum depth (100)", () => {
        // Create 102 routes to form a chain that exceeds max depth
        const routes = [];

        for (let i = 0; i <= 101; i++) {
          routes.push({ name: `ur-chain-${i}`, path: `/ur-chain-${i}` });
        }

        router.addRoute(routes);

        // Create forward chain: chain-0 → chain-1 → ... → chain-99 (100 items, depth 100)
        // This creates 99 links (i=0..98)
        for (let i = 0; i < 99; i++) {
          router.updateRoute(`ur-chain-${i}`, {
            forwardTo: `ur-chain-${i + 1}`,
          });
        }

        // Adding the 100th link (chain-99 → chain-100) would make chain of 101 items
        // This should exceed max depth of 100
        expect(() =>
          router.updateRoute("ur-chain-99", { forwardTo: "ur-chain-100" }),
        ).toThrowError(/exceeds maximum depth/);
      });
    });
  });

  describe("defaultParams", () => {
    it("should add defaultParams", () => {
      router.addRoute({ name: "ur-members", path: "/ur-members" });

      router.updateRoute("ur-members", {
        defaultParams: { page: 1, limit: 10 },
      });

      // Verify via makeState
      expect(router.makeState("ur-members").params).toStrictEqual({
        page: 1,
        limit: 10,
      });
    });

    it("should update existing defaultParams", () => {
      router.addRoute({
        name: "ur-accounts",
        path: "/ur-accounts",
        defaultParams: { page: 1 },
      });

      router.updateRoute("ur-accounts", {
        defaultParams: { page: 2, limit: 20 },
      });

      // Verify via makeState
      expect(router.makeState("ur-accounts").params).toStrictEqual({
        page: 2,
        limit: 20,
      });
    });

    it("should remove defaultParams when null", () => {
      router.addRoute({
        name: "ur-teams",
        path: "/ur-teams",
        defaultParams: { page: 1 },
      });

      router.updateRoute("ur-teams", { defaultParams: null });

      // Verify via makeState - no defaults
      expect(router.makeState("ur-teams").params).toStrictEqual({});
    });
  });

  describe("decodeParams", () => {
    it("should add decodeParams", () => {
      const decoder = vi.fn(
        (params: Params): Params => ({
          ...params,
          id: Number(params.id),
        }),
      );

      router.addRoute({ name: "ur-items", path: "/ur-items/:id" });
      router.updateRoute("ur-items", { decodeParams: decoder });

      // Verify via matchPath
      const state = router.matchPath("/ur-items/123");

      expect(decoder).toHaveBeenCalled();
      expect(state?.params.id).toBe(123);
    });

    it("should update existing decodeParams", () => {
      const decoder1 = vi.fn((params: Params): Params => params);
      const decoder2 = vi.fn(
        (params: Params): Params => ({
          ...params,
          id: Number(params.id),
        }),
      );

      router.addRoute({
        name: "ur-products",
        path: "/ur-products/:id",
        decodeParams: decoder1,
      });
      router.updateRoute("ur-products", { decodeParams: decoder2 });

      // Verify new decoder is used
      const state = router.matchPath("/ur-products/456");

      expect(decoder2).toHaveBeenCalled();
      expect(state?.params.id).toBe(456);
    });

    it("should remove decodeParams when null", () => {
      const decoder = vi.fn(
        (params: Params): Params => ({
          ...params,
          decoded: true,
        }),
      );

      router.addRoute({
        name: "ur-assets",
        path: "/ur-assets/:id",
        decodeParams: decoder,
      });

      // Verify decoder works before removal
      router.matchPath("/ur-assets/1");

      expect(decoder).toHaveBeenCalled();

      decoder.mockClear();

      router.updateRoute("ur-assets", { decodeParams: null });

      // Verify decoder is no longer called
      const state = router.matchPath("/ur-assets/2");

      expect(decoder).not.toHaveBeenCalled();
      expect(state?.params.id).toBe("2"); // String, not decoded
    });

    it("should use updated decoder in matchPath", () => {
      router.addRoute({ name: "ur-decode-test", path: "/ur-decode-test/:id" });
      router.updateRoute("ur-decode-test", {
        decodeParams: (params) => ({ ...params, id: Number(params.id) }),
      });

      const state = router.matchPath("/ur-decode-test/123");

      expect(state?.params.id).toBe(123);
      expect(typeof state?.params.id).toBe("number");
    });

    it("should fallback to original params when decoder returns undefined", () => {
      router.addRoute({
        name: "ur-decode-undef",
        path: "/ur-decode-undef/:id",
      });
      router.updateRoute("ur-decode-undef", {
        // Decoder that returns undefined (bad user code)
        decodeParams: () => undefined as unknown as Params,
      });

      // Should fallback to original params
      const state = router.matchPath("/ur-decode-undef/123");

      expect(state?.params.id).toBe("123");
    });
  });

  describe("encodeParams", () => {
    it("should add encodeParams", () => {
      const encoder = vi.fn(
        (params: Params): Params => ({
          ...params,
          id: String(params.id as string | number),
        }),
      );

      router.addRoute({ name: "ur-goods", path: "/ur-goods/:id" });
      router.updateRoute("ur-goods", { encodeParams: encoder });

      // Verify via buildPath
      router.buildPath("ur-goods", { id: 123 });

      expect(encoder).toHaveBeenCalledWith({ id: 123 });
    });

    it("should update existing encodeParams", () => {
      const encoder1 = vi.fn((params: Params): Params => params);
      const encoder2 = vi.fn(
        (params: Params): Params => ({
          ...params,
          id: String(params.id as string | number),
        }),
      );

      router.addRoute({
        name: "ur-things",
        path: "/ur-things/:id",
        encodeParams: encoder1,
      });
      router.updateRoute("ur-things", { encodeParams: encoder2 });

      // Verify new encoder is used
      router.buildPath("ur-things", { id: 456 });

      expect(encoder2).toHaveBeenCalled();
    });

    it("should remove encodeParams when null", () => {
      const encoder = vi.fn((params: Params): Params => params);

      router.addRoute({
        name: "ur-stuff",
        path: "/ur-stuff/:id",
        encodeParams: encoder,
      });

      // Verify encoder works before removal
      router.buildPath("ur-stuff", { id: 1 });

      expect(encoder).toHaveBeenCalled();

      encoder.mockClear();

      router.updateRoute("ur-stuff", { encodeParams: null });

      // Verify encoder is no longer called
      router.buildPath("ur-stuff", { id: 2 });

      expect(encoder).not.toHaveBeenCalled();
    });

    it("should use updated encoder in buildPath", () => {
      router.addRoute({ name: "ur-encode-test", path: "/ur-encode-test/:id" });
      router.updateRoute("ur-encode-test", {
        encodeParams: (params) => {
          const idValue = params.id as string;

          return { ...params, id: `user-${idValue}` };
        },
      });

      const path = router.buildPath("ur-encode-test", { id: "123" });

      expect(path).toBe("/ur-encode-test/user-123");
    });

    it("should fallback to original params when encoder returns undefined", () => {
      router.addRoute({
        name: "ur-encode-undef",
        path: "/ur-encode-undef/:id",
      });
      router.updateRoute("ur-encode-undef", {
        // Encoder that returns undefined (bad user code)
        encodeParams: () => undefined as unknown as Params,
      });

      // Should fallback to original params
      const path = router.buildPath("ur-encode-undef", { id: "123" });

      expect(path).toBe("/ur-encode-undef/123");
    });
  });

  describe("canActivate", () => {
    it("should add canActivate", async () => {
      const guard = vi.fn().mockReturnValue(true);
      const guardFactory: ActivationFnFactory = () => guard;

      router.addRoute({ name: "ur-secure", path: "/ur-secure" });
      router.updateRoute("ur-secure", { canActivate: guardFactory });

      // Verify canActivate works by navigating
      await router.navigate("ur-secure");

      expect(guard).toHaveBeenCalled();
    });

    it("should update existing canActivate", async () => {
      const guard1 = vi.fn().mockReturnValue(true);
      const guard2 = vi.fn().mockReturnValue(false);

      router.addRoute({
        name: "ur-guarded",
        path: "/ur-guarded",
        canActivate: () => guard1,
      });
      router.updateRoute("ur-guarded", { canActivate: () => guard2 });

      // Verify new guard is used - navigation should be blocked
      try {
        await router.navigate("ur-guarded");

        expect.fail("Should have thrown");
      } catch (error) {
        expect((error as RouterError).code).toBe(errorCodes.CANNOT_ACTIVATE);
        expect(guard2).toHaveBeenCalled();
        expect(guard1).not.toHaveBeenCalled();
      }
    });

    it("should remove canActivate when null", async () => {
      const guard = vi.fn().mockReturnValue(false);

      router.addRoute({
        name: "ur-locked",
        path: "/ur-locked",
        canActivate: () => guard,
      });

      // Verify guard is active - navigation blocked
      try {
        await router.navigate("ur-locked");

        expect.fail("Should have thrown");
      } catch (error) {
        expect((error as RouterError).code).toBe(errorCodes.CANNOT_ACTIVATE);
      }

      guard.mockClear();

      // Remove canActivate
      router.updateRoute("ur-locked", { canActivate: null });

      // Now navigation should succeed
      await router.navigate("ur-locked");

      expect(guard).not.toHaveBeenCalled();
    });
  });

  describe("canDeactivate", () => {
    it("should add canDeactivate", async () => {
      const guard = vi.fn().mockReturnValue(false);
      const guardFactory: ActivationFnFactory = () => guard;

      router.addRoute({ name: "ur-editor", path: "/ur-editor" });
      router.updateRoute("ur-editor", { canDeactivate: guardFactory });

      // Navigate to route
      await router.navigate("ur-editor");

      guard.mockClear();

      // Navigate away - should be blocked
      try {
        await router.navigate("home");

        expect.fail("Should have thrown");
      } catch (error) {
        expect((error as RouterError).code).toBe(errorCodes.CANNOT_DEACTIVATE);
        expect(guard).toHaveBeenCalled();
      }
    });

    it("should remove canDeactivate when null", async () => {
      const guard = vi.fn().mockReturnValue(false);

      router.addRoute({
        name: "ur-form",
        path: "/ur-form",
        canDeactivate: () => guard,
      });

      // Navigate to route
      await router.navigate("ur-form");

      // Verify guard is active - navigation blocked
      try {
        await router.navigate("home");

        expect.fail("Should have thrown");
      } catch (error) {
        expect((error as RouterError).code).toBe(errorCodes.CANNOT_DEACTIVATE);
      }

      guard.mockClear();

      // Remove canDeactivate
      router.updateRoute("ur-form", { canDeactivate: null });

      // Now navigation should succeed
      await router.navigate("home");

      expect(guard).not.toHaveBeenCalled();
    });

    it("should update existing canDeactivate", async () => {
      const guard1 = vi.fn().mockReturnValue(false);
      const guard2 = vi.fn().mockReturnValue(true);

      router.addRoute({
        name: "ur-page",
        path: "/ur-page",
        canDeactivate: () => guard1,
      });
      router.updateRoute("ur-page", { canDeactivate: () => guard2 });

      // Navigate to route
      await router.navigate("ur-page");

      guard1.mockClear();
      guard2.mockClear();

      // Navigate away - new guard should fire, old guard should NOT
      await router.navigate("home");

      expect(guard2).toHaveBeenCalled();
      expect(guard1).not.toHaveBeenCalled();
    });
  });

  describe("validation", () => {
    it("should throw ReferenceError for non-existent route", () => {
      expect(() =>
        router.updateRoute("nonexistent", { defaultParams: { x: 1 } }),
      ).toThrowError(ReferenceError);

      expect(() =>
        router.updateRoute("nonexistent", { defaultParams: { x: 1 } }),
      ).toThrowError(
        '[real-router] updateRoute: route "nonexistent" does not exist',
      );
    });

    it("should throw ReferenceError for empty string (root node)", () => {
      // Empty string represents the root node, which is not a named route
      expect(() =>
        router.updateRoute("", { defaultParams: { x: 1 } }),
      ).toThrowError(ReferenceError);
    });

    it("should throw TypeError for invalid name (leading dot)", () => {
      expect(() =>
        router.updateRoute(".invalid", { defaultParams: { x: 1 } }),
      ).toThrowError(TypeError);
    });

    it("should throw TypeError for non-string name", () => {
      // Number
      expect(() =>
        router.updateRoute(123 as unknown as string, {
          defaultParams: { x: 1 },
        }),
      ).toThrowError(TypeError);

      // Object
      expect(() =>
        router.updateRoute({} as unknown as string, {
          defaultParams: { x: 1 },
        }),
      ).toThrowError(TypeError);

      // Null
      expect(() =>
        router.updateRoute(null as unknown as string, {
          defaultParams: { x: 1 },
        }),
      ).toThrowError(TypeError);

      // Undefined
      expect(() =>
        router.updateRoute(undefined as unknown as string, {
          defaultParams: { x: 1 },
        }),
      ).toThrowError(TypeError);
    });

    it("should throw TypeError for whitespace-only name", () => {
      expect(() =>
        router.updateRoute("   ", { defaultParams: { x: 1 } }),
      ).toThrowError(TypeError);

      expect(() =>
        router.updateRoute("\t\n", { defaultParams: { x: 1 } }),
      ).toThrowError(TypeError);
    });

    it("should throw TypeError for name exceeding 10000 characters", () => {
      const longName = "a".repeat(10_001);

      expect(() =>
        router.updateRoute(longName, { defaultParams: { x: 1 } }),
      ).toThrowError(TypeError);

      expect(() =>
        router.updateRoute(longName, { defaultParams: { x: 1 } }),
      ).toThrowError(/exceeds maximum length/);
    });

    it("should throw TypeError for null updates", () => {
      router.addRoute({ name: "ur-null-test", path: "/ur-null-test" });

      expect(() =>
        router.updateRoute("ur-null-test", null as unknown as object),
      ).toThrowError(TypeError);

      expect(() =>
        router.updateRoute("ur-null-test", null as unknown as object),
      ).toThrowError(
        "[real-router] updateRoute: updates must be an object, got null",
      );
    });

    it("should throw TypeError for primitive updates", () => {
      router.addRoute({ name: "ur-prim-test", path: "/ur-prim-test" });

      expect(() =>
        router.updateRoute("ur-prim-test", "string" as unknown as object),
      ).toThrowError(
        "[real-router] updateRoute: updates must be an object, got string",
      );

      expect(() =>
        router.updateRoute("ur-prim-test", 123 as unknown as object),
      ).toThrowError(
        "[real-router] updateRoute: updates must be an object, got number",
      );
    });

    it("should throw TypeError for array updates", () => {
      router.addRoute({ name: "ur-arr-test", path: "/ur-arr-test" });

      expect(() =>
        router.updateRoute("ur-arr-test", [] as unknown as object),
      ).toThrowError(
        "[real-router] updateRoute: updates must be an object, got array",
      );
    });

    it("should throw TypeError for invalid defaultParams", () => {
      router.addRoute({ name: "ur-dp-test", path: "/ur-dp-test" });

      // Not an object (string)
      expect(() =>
        router.updateRoute("ur-dp-test", {
          defaultParams: "string" as unknown as Params,
        }),
      ).toThrowError(
        "[real-router] updateRoute: defaultParams must be an object or null, got string",
      );

      // Not an object (number)
      expect(() =>
        router.updateRoute("ur-dp-test", {
          defaultParams: 123 as unknown as Params,
        }),
      ).toThrowError(
        "[real-router] updateRoute: defaultParams must be an object or null, got number",
      );

      // Array is not valid for defaultParams
      expect(() =>
        router.updateRoute("ur-dp-test", {
          defaultParams: [] as unknown as Params,
        }),
      ).toThrowError(
        "[real-router] updateRoute: defaultParams must be an object or null, got array",
      );

      // Function is not valid for defaultParams
      expect(() =>
        router.updateRoute("ur-dp-test", {
          defaultParams: (() => ({})) as unknown as Params,
        }),
      ).toThrowError(
        "[real-router] updateRoute: defaultParams must be an object or null, got function",
      );
    });

    it("should throw TypeError for invalid decodeParams", () => {
      router.addRoute({ name: "ur-dec-test", path: "/ur-dec-test" });

      // Not a function (string)
      expect(() =>
        router.updateRoute("ur-dec-test", {
          decodeParams: "string" as unknown as (params: Params) => Params,
        }),
      ).toThrowError(
        "[real-router] updateRoute: decodeParams must be a function or null, got string",
      );

      // Not a function (object)
      expect(() =>
        router.updateRoute("ur-dec-test", {
          decodeParams: {} as unknown as (params: Params) => Params,
        }),
      ).toThrowError(
        "[real-router] updateRoute: decodeParams must be a function or null, got object",
      );

      // Not a function (number)
      expect(() =>
        router.updateRoute("ur-dec-test", {
          decodeParams: 42 as unknown as (params: Params) => Params,
        }),
      ).toThrowError(
        "[real-router] updateRoute: decodeParams must be a function or null, got number",
      );
    });

    it("should throw TypeError for invalid encodeParams", () => {
      router.addRoute({ name: "ur-enc-test", path: "/ur-enc-test" });

      // Not a function (string)
      expect(() =>
        router.updateRoute("ur-enc-test", {
          encodeParams: "string" as unknown as (params: Params) => Params,
        }),
      ).toThrowError(
        "[real-router] updateRoute: encodeParams must be a function or null, got string",
      );

      // Not a function (array)
      expect(() =>
        router.updateRoute("ur-enc-test", {
          encodeParams: [] as unknown as (params: Params) => Params,
        }),
      ).toThrowError(
        "[real-router] updateRoute: encodeParams must be a function or null, got object",
      );
    });

    it("should throw TypeError for async decodeParams", () => {
      router.addRoute({ name: "ur-async-dec", path: "/ur-async-dec" });

      // Async function - cast needed because TS doesn't allow async for this type
      expect(() =>
        router.updateRoute("ur-async-dec", {
          decodeParams: (async (params: Params) => params) as unknown as (
            params: Params,
          ) => Params,
        }),
      ).toThrowError(
        "[real-router] updateRoute: decodeParams cannot be an async function",
      );
    });

    it("should throw TypeError for async encodeParams", () => {
      router.addRoute({ name: "ur-async-enc", path: "/ur-async-enc" });

      // Async function - cast needed because TS doesn't allow async for this type
      expect(() =>
        router.updateRoute("ur-async-enc", {
          encodeParams: (async (params: Params) => params) as unknown as (
            params: Params,
          ) => Params,
        }),
      ).toThrowError(
        "[real-router] updateRoute: encodeParams cannot be an async function",
      );
    });

    it("should accept valid defaultParams, decodeParams, encodeParams", () => {
      router.addRoute({ name: "ur-valid-test", path: "/ur-valid-test" });

      // Valid object for defaultParams
      expect(() =>
        router.updateRoute("ur-valid-test", {
          defaultParams: { page: 1, sort: "name" },
        }),
      ).not.toThrowError();

      // null is valid for defaultParams (remove)
      expect(() =>
        router.updateRoute("ur-valid-test", { defaultParams: null }),
      ).not.toThrowError();

      // Valid function for decodeParams
      expect(() =>
        router.updateRoute("ur-valid-test", {
          decodeParams: (params) => params,
        }),
      ).not.toThrowError();

      // null is valid for decodeParams (remove)
      expect(() =>
        router.updateRoute("ur-valid-test", { decodeParams: null }),
      ).not.toThrowError();

      // Valid function for encodeParams
      expect(() =>
        router.updateRoute("ur-valid-test", {
          encodeParams: (params) => params,
        }),
      ).not.toThrowError();

      // null is valid for encodeParams (remove)
      expect(() =>
        router.updateRoute("ur-valid-test", { encodeParams: null }),
      ).not.toThrowError();
    });

    it("should return router for chaining", () => {
      router.addRoute({ name: "ur-chainable", path: "/ur-chainable" });

      const result = router.updateRoute("ur-chainable", {
        defaultParams: { page: 1 },
      });

      expect(result).toBe(router);
    });
  });

  describe("multiple updates", () => {
    it("should update multiple properties at once", async () => {
      const decoder = (params: Params): Params => params;
      const guard = vi.fn().mockReturnValue(true);
      const guardFactory: ActivationFnFactory = () => guard;

      router.addRoute({ name: "ur-multi", path: "/ur-multi" });
      router.updateRoute("ur-multi", {
        defaultParams: { page: 1 },
        decodeParams: decoder,
        canActivate: guardFactory,
      });

      // Verify defaultParams via behavior
      expect(router.makeState("ur-multi").params).toStrictEqual({ page: 1 });

      // Verify canActivate via navigation
      await router.navigate("ur-multi");

      expect(guard).toHaveBeenCalled();
    });

    it("should chain multiple updateRoute calls", () => {
      router.addRoute({ name: "ur-chain", path: "/ur-chain" });

      router
        .updateRoute("ur-chain", { defaultParams: { page: 1 } })
        .updateRoute("ur-chain", { defaultParams: { page: 2, limit: 10 } });

      // Verify via behavior
      expect(router.makeState("ur-chain").params).toStrictEqual({
        page: 2,
        limit: 10,
      });
    });
  });

  describe("nested routes", () => {
    it("should update nested route configuration", () => {
      router.addRoute({
        name: "ur-parent",
        path: "/ur-parent",
        children: [{ name: "child", path: "/child" }],
      });

      router.updateRoute("ur-parent.child", { defaultParams: { tab: "info" } });

      // Verify via behavior
      expect(router.makeState("ur-parent.child").params).toStrictEqual({
        tab: "info",
      });
    });

    it("should throw for non-existent nested route", () => {
      router.addRoute({ name: "ur-solo", path: "/ur-solo" });

      expect(() =>
        router.updateRoute("ur-solo.missing", { defaultParams: { x: 1 } }),
      ).toThrowError(
        '[real-router] updateRoute: route "ur-solo.missing" does not exist',
      );
    });
  });

  describe("navigation warnings", () => {
    it("should error when updating route during active navigation", async () => {
      const { logger } = await import("logger");
      const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});

      let resolveCanActivate: () => void;
      const canActivatePromise = new Promise<void>((resolve) => {
        resolveCanActivate = resolve;
      });

      router.addRoute({
        name: "ur-async",
        path: "/ur-async",
        canActivate: () => async () => {
          await canActivatePromise;

          return true;
        },
      });

      // Start async navigation
      router.navigate("ur-async");

      // Give time for navigation to start
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Try to update during navigation - should log error but proceed
      router.updateRoute("ur-async", { defaultParams: { page: 1 } });

      expect(errorSpy).toHaveBeenCalledWith(
        "router.updateRoute",
        expect.stringContaining("navigation is in progress"),
      );

      // Config should be updated (we only log error, don't block)
      expect(router.makeState("ur-async").params).toStrictEqual({
        page: 1,
      });

      // Cleanup
      resolveCanActivate!();
      await new Promise((resolve) => setTimeout(resolve, 10));

      errorSpy.mockRestore();
    });

    it("should not log error when updating route without active navigation", async () => {
      const { logger } = await import("logger");
      const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});

      router.addRoute({ name: "ur-no-warn", path: "/ur-no-warn" });

      // Update should not log error (no navigation in progress)
      router.updateRoute("ur-no-warn", { defaultParams: { page: 1 } });

      expect(errorSpy).not.toHaveBeenCalledWith(
        "router.updateRoute",
        expect.any(String),
      );

      errorSpy.mockRestore();
    });
  });

  describe("getRoute integration", () => {
    it("should reflect updates in getRoute", () => {
      router.addRoute({ name: "ur-reflect", path: "/ur-reflect" });
      router.updateRoute("ur-reflect", { defaultParams: { page: 1 } });

      const route = router.getRoute("ur-reflect");

      expect(route?.defaultParams).toStrictEqual({ page: 1 });
    });

    it("should reflect removed properties in getRoute", () => {
      router.addRoute({
        name: "ur-remove",
        path: "/ur-remove",
        defaultParams: { page: 1 },
      });
      router.updateRoute("ur-remove", { defaultParams: null });

      const route = router.getRoute("ur-remove");

      expect(route?.defaultParams).toBeUndefined();
    });
  });

  describe("edge cases", () => {
    describe("empty and no-op updates", () => {
      it("should accept empty object as no-op", () => {
        router.addRoute({ name: "ur-empty", path: "/ur-empty" });

        // Should not throw
        expect(() => router.updateRoute("ur-empty", {})).not.toThrowError();

        // No defaults should be applied
        expect(router.makeState("ur-empty").params).toStrictEqual({});
      });

      it("should treat missing properties as no-op", () => {
        router.addRoute({
          name: "ur-undef",
          path: "/ur-undef",
          defaultParams: { existing: 1 },
        });

        // Empty object - no properties means no changes
        router.updateRoute("ur-undef", {});

        // Existing config should be preserved
        expect(router.makeState("ur-undef").params).toStrictEqual({
          existing: 1,
        });
      });
    });

    describe("exotic objects", () => {
      it("should accept Object.freeze updates", () => {
        router.addRoute({ name: "ur-frozen", path: "/ur-frozen" });

        const frozenUpdates = Object.freeze({
          defaultParams: Object.freeze({ page: 1 }),
        });

        expect(() =>
          router.updateRoute("ur-frozen", frozenUpdates),
        ).not.toThrowError();
        expect(router.makeState("ur-frozen").params).toStrictEqual({
          page: 1,
        });
      });

      it("should accept null prototype defaultParams", () => {
        router.addRoute({ name: "ur-nullproto", path: "/ur-nullproto" });

        const nullProtoParams = Object.create(null) as Params;

        nullProtoParams.page = 1;

        router.updateRoute("ur-nullproto", { defaultParams: nullProtoParams });

        // Verify behavior - params should work
        const state = router.makeState("ur-nullproto");

        expect(state.params).toMatchObject({ page: 1 });
      });

      it("should accept class instance as defaultParams", () => {
        router.addRoute({ name: "ur-class", path: "/ur-class" });

        class PageParams {
          page = 1;
          limit = 10;
        }

        // Cast needed because class doesn't have index signature
        router.updateRoute("ur-class", {
          defaultParams: new PageParams() as unknown as Params,
        });

        // Verify behavior
        const state = router.makeState("ur-class");

        expect(state.params).toMatchObject({ page: 1, limit: 10 });
      });

      it("should accept defaultParams with circular reference", () => {
        router.addRoute({ name: "ur-circular", path: "/ur-circular" });

        const circular: Params = { page: 1 };

        (circular as Record<string, unknown>).self = circular;

        // Should not throw on assignment
        expect(() =>
          router.updateRoute("ur-circular", { defaultParams: circular }),
        ).not.toThrowError();

        // Verify behavior - page should be accessible
        const state = router.makeState("ur-circular");

        expect(state.params.page).toBe(1);
      });

      it("should preserve Symbol keys in defaultParams (but may lose on copy)", () => {
        router.addRoute({ name: "ur-symbol", path: "/ur-symbol" });

        const sym = Symbol("hidden");
        const params = { page: 1, [sym]: "secret" };

        router.updateRoute("ur-symbol", { defaultParams: params });

        // Verify behavior - page should be accessible
        const state = router.makeState("ur-symbol");

        expect(state.params.page).toBe(1);
      });
    });

    describe("function edge cases", () => {
      it("should accept bound function as decodeParams", () => {
        router.addRoute({ name: "ur-bound", path: "/ur-bound/:id" });

        const decoder = {
          prefix: "decoded_",
          decode(params: Params): Params {
            return { ...params, tag: this.prefix + (params.id as string) };
          },
        };

        router.updateRoute("ur-bound", {
          decodeParams: decoder.decode.bind(decoder),
        });

        const state = router.matchPath("/ur-bound/123");

        expect(state?.params).toStrictEqual({ id: "123", tag: "decoded_123" });
      });

      it("should accept arrow function as encodeParams", () => {
        router.addRoute({ name: "ur-arrow", path: "/ur-arrow/:id" });

        router.updateRoute("ur-arrow", {
          encodeParams: (params) => ({
            ...params,
            id: (params.id as string).toUpperCase(),
          }),
        });

        const path = router.buildPath("ur-arrow", { id: "abc" });

        expect(path).toBe("/ur-arrow/ABC");
      });

      it("should accept arrow function as canActivate factory", async () => {
        const guard = vi.fn().mockReturnValue(true);

        router.addRoute({ name: "ur-arrow-guard", path: "/ur-arrow-guard" });

        router.updateRoute("ur-arrow-guard", {
          canActivate: () => guard,
        });

        // Verify canActivate works via navigation
        await router.navigate("ur-arrow-guard");

        expect(guard).toHaveBeenCalled();
      });
    });

    describe("forwardTo edge cases", () => {
      it("should reject forwardTo empty string", () => {
        router.addRoute({ name: "ur-fwd-empty", path: "/ur-fwd-empty" });

        expect(() =>
          router.updateRoute("ur-fwd-empty", { forwardTo: "" }),
        ).toThrowError();
      });

      it("should reject forwardTo to self (direct cycle)", () => {
        router.addRoute({ name: "ur-self", path: "/ur-self" });

        expect(() =>
          router.updateRoute("ur-self", { forwardTo: "ur-self" }),
        ).toThrowError(/Circular forwardTo/);
      });

      it("should reject forwardTo with invalid type (not string or null)", () => {
        router.addRoute({ name: "ur-invalid-fwd", path: "/ur-invalid-fwd" });

        expect(() =>
          router.updateRoute("ur-invalid-fwd", { forwardTo: 123 as any }),
        ).toThrowError(/forwardTo must be a string, function, or null/);

        expect(() =>
          router.updateRoute("ur-invalid-fwd", { forwardTo: {} as any }),
        ).toThrowError(/forwardTo must be a string, function, or null/);
      });
    });

    describe("atomicity (partial update scenarios)", () => {
      it("should NOT apply forwardTo if later validation fails", () => {
        router.addRoute({ name: "ur-atom-src", path: "/ur-atom-src" });
        router.addRoute({ name: "ur-atom-tgt", path: "/ur-atom-tgt" });

        expect(() =>
          router.updateRoute("ur-atom-src", {
            forwardTo: "ur-atom-tgt",
            defaultParams: "invalid" as unknown as Params,
          }),
        ).toThrowError(/defaultParams must be an object/);

        // forwardTo should NOT be applied due to validation-first approach
        // Verify by checking forwardState returns same route (no forward)
        expect(router.forwardState("ur-atom-src", {}).name).toBe("ur-atom-src");
      });

      it("should rollback forwardTo if forwardTo validation fails after mutation", () => {
        // This test documents current behavior where forwardTo error
        // occurs during validation BEFORE mutation, so config stays clean
        router.addRoute({ name: "ur-atom-fwd", path: "/ur-atom-fwd" });

        expect(() =>
          router.updateRoute("ur-atom-fwd", {
            forwardTo: "nonexistent",
            defaultParams: { page: 1 },
          }),
        ).toThrowError(/forwardTo target.*does not exist/);

        // Both should NOT be applied
        // No forward configured - forwardState returns same route
        expect(router.forwardState("ur-atom-fwd", {}).name).toBe("ur-atom-fwd");
        // No defaultParams - makeState returns empty params
        expect(router.makeState("ur-atom-fwd").params).toStrictEqual({});
      });
    });

    describe("sequential updates", () => {
      it("should replace (not merge) defaultParams on multiple updates", () => {
        router.addRoute({ name: "ur-seq", path: "/ur-seq" });

        router.updateRoute("ur-seq", { defaultParams: { a: 1, b: 2 } });
        router.updateRoute("ur-seq", { defaultParams: { c: 3 } });

        const state = router.makeState("ur-seq");

        // Should be replaced, not merged
        expect(state.params).toStrictEqual({ c: 3 });
        expect(state.params).not.toHaveProperty("a");
        expect(state.params).not.toHaveProperty("b");
      });

      it("should allow updating different properties independently", () => {
        router.addRoute({ name: "ur-indep", path: "/ur-indep" });

        router.updateRoute("ur-indep", { defaultParams: { page: 1 } });
        router.updateRoute("ur-indep", {
          decodeParams: (p) => ({ ...p, decoded: true }),
        });

        // defaultParams should still be set
        expect(router.makeState("ur-indep").params).toStrictEqual({
          page: 1,
        });

        // Decoder should be active - verify via matchPath
        const state = router.matchPath("/ur-indep");

        expect(state?.params).toHaveProperty("decoded", true);
      });
    });

    describe("mutating getters (edge case)", () => {
      it("should cache getter value to ensure consistent behavior", () => {
        router.addRoute({ name: "ur-getter", path: "/ur-getter" });

        let callCount = 0;
        const mutatingUpdates = {
          get defaultParams() {
            callCount++;

            return { page: callCount };
          },
        };

        router.updateRoute("ur-getter", mutatingUpdates);

        // Getter is called exactly once during destructuring
        // This protects against mutating getters returning different values
        const state = router.makeState("ur-getter");

        expect(state.params).toStrictEqual({ page: 1 });
        expect(callCount).toBe(1); // Called only once during caching
      });

      it("should propagate exception from throwing getter without modifying config", () => {
        router.addRoute({
          name: "ur-throwing",
          path: "/ur-throwing",
          defaultParams: { original: true },
        });

        const throwingUpdates = {
          get defaultParams(): Params {
            throw new Error("Getter explosion!");
          },
        };

        // Exception propagates to caller
        expect(() =>
          router.updateRoute("ur-throwing", throwingUpdates),
        ).toThrowError("Getter explosion!");

        // Config remains unchanged - exception happens during destructuring,
        // before any mutations
        expect(router.makeState("ur-throwing").params).toStrictEqual({
          original: true,
        });
      });
    });

    describe("Proxy objects", () => {
      it("should work with Proxy that passes through values", () => {
        router.addRoute({ name: "ur-proxy", path: "/ur-proxy" });

        const updates = new Proxy(
          { defaultParams: { page: 1 } },
          {
            get(target, prop) {
              return Reflect.get(target, prop);
            },
          },
        );

        expect(() =>
          router.updateRoute("ur-proxy", updates),
        ).not.toThrowError();
        expect(router.makeState("ur-proxy").params).toStrictEqual({
          page: 1,
        });
      });
    });
  });

  describe("forwardTo function transitions", () => {
    it("should update string forwardTo to function", () => {
      router.addRoute({ name: "source", path: "/source" });
      router.addRoute({ name: "target-a", path: "/target-a" });
      router.addRoute({ name: "target-b", path: "/target-b" });

      router.updateRoute("source", { forwardTo: "target-a" });

      expect(router.forwardState("source", {}).name).toBe("target-a");

      router.updateRoute("source", {
        forwardTo: () => "target-b",
      });

      const result = router.forwardState("source", {});

      expect(result.name).toBe("target-b");
    });

    it("should update function forwardTo to string", () => {
      router.addRoute({ name: "dynamic-source", path: "/dynamic-source" });
      router.addRoute({ name: "dest-1", path: "/dest-1" });
      router.addRoute({ name: "dest-2", path: "/dest-2" });

      router.updateRoute("dynamic-source", {
        forwardTo: () => "dest-1",
      });

      expect(router.forwardState("dynamic-source", {}).name).toBe("dest-1");

      router.updateRoute("dynamic-source", { forwardTo: "dest-2" });

      expect(router.forwardState("dynamic-source", {}).name).toBe("dest-2");
    });

    it("should clear both maps when updating function to null", () => {
      router.addRoute({ name: "clear-test", path: "/clear-test" });
      router.addRoute({ name: "some-target", path: "/some-target" });

      router.updateRoute("clear-test", {
        forwardTo: () => "some-target",
      });

      expect(router.forwardState("clear-test", {}).name).toBe("some-target");

      router.updateRoute("clear-test", { forwardTo: null });

      expect(router.forwardState("clear-test", {}).name).toBe("clear-test");
    });

    it("should handle function → null → string sequence", () => {
      router.addRoute({ name: "seq-test", path: "/seq-test" });
      router.addRoute({ name: "final-dest", path: "/final-dest" });

      router.updateRoute("seq-test", {
        forwardTo: () => "final-dest",
      });

      expect(router.forwardState("seq-test", {}).name).toBe("final-dest");

      router.updateRoute("seq-test", { forwardTo: null });

      expect(router.forwardState("seq-test", {}).name).toBe("seq-test");

      router.updateRoute("seq-test", { forwardTo: "final-dest" });

      expect(router.forwardState("seq-test", {}).name).toBe("final-dest");
    });
  });
});
