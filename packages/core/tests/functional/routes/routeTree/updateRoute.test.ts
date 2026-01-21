import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { getConfig } from "../../../../src/internals";
import { createTestRouter } from "../../../helpers";

import type { Router, ActivationFnFactory, Params } from "@real-router/core";

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

      expect(getConfig(router).forwardMap["ur-source"]).toBe("ur-target");
    });

    it("should update existing forwardTo", () => {
      router.addRoute({ name: "ur-src", path: "/ur-src" });
      router.addRoute({ name: "ur-target1", path: "/ur-target1" });
      router.addRoute({ name: "ur-target2", path: "/ur-target2" });
      router.updateRoute("ur-src", { forwardTo: "ur-target1" });

      router.updateRoute("ur-src", { forwardTo: "ur-target2" });

      expect(getConfig(router).forwardMap["ur-src"]).toBe("ur-target2");
    });

    it("should remove forwardTo when null", () => {
      router.addRoute({ name: "ur-dest", path: "/ur-dest" });
      router.addRoute({
        name: "ur-origin",
        path: "/ur-origin",
        forwardTo: "ur-dest",
      });

      router.updateRoute("ur-origin", { forwardTo: null });

      expect(getConfig(router).forwardMap["ur-origin"]).toBeUndefined();
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
        '[real-router] updateRoute: forwardTo target "ur-param" requires params [id] that are not available in source route "ur-static"',
      );
    });

    it("should allow forwardTo when params match", () => {
      router.addRoute({ name: "ur-old", path: "/ur-old/:id" });
      router.addRoute({ name: "ur-new", path: "/ur-new/:id" });

      expect(() =>
        router.updateRoute("ur-old", { forwardTo: "ur-new" }),
      ).not.toThrowError();

      expect(getConfig(router).forwardMap["ur-old"]).toBe("ur-new");
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

        // forwardMap should remain clean (without ur-c)
        expect(getConfig(router).forwardMap["ur-a"]).toBe("ur-b");
        expect(getConfig(router).forwardMap["ur-b"]).toBe("ur-c");
        expect(getConfig(router).forwardMap["ur-c"]).toBeUndefined();
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

        // forwardMap should remain without ur-w → ur-x
        expect(getConfig(router).forwardMap["ur-w"]).toBeUndefined();
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

      expect(getConfig(router).defaultParams["ur-members"]).toStrictEqual({
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

      expect(getConfig(router).defaultParams["ur-accounts"]).toStrictEqual({
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

      expect(getConfig(router).defaultParams["ur-teams"]).toBeUndefined();
    });
  });

  describe("decodeParams", () => {
    it("should add decodeParams", () => {
      const decoder = (params: Params): Params => ({
        ...params,
        id: Number(params.id),
      });

      router.addRoute({ name: "ur-items", path: "/ur-items/:id" });
      router.updateRoute("ur-items", { decodeParams: decoder });

      expect(getConfig(router).decoders["ur-items"]).toBe(decoder);
    });

    it("should update existing decodeParams", () => {
      const decoder1 = (params: Params): Params => params;
      const decoder2 = (params: Params): Params => ({
        ...params,
        id: Number(params.id),
      });

      router.addRoute({
        name: "ur-products",
        path: "/ur-products/:id",
        decodeParams: decoder1,
      });
      router.updateRoute("ur-products", { decodeParams: decoder2 });

      expect(getConfig(router).decoders["ur-products"]).toBe(decoder2);
    });

    it("should remove decodeParams when null", () => {
      const decoder = (params: Params): Params => params;

      router.addRoute({
        name: "ur-assets",
        path: "/ur-assets/:id",
        decodeParams: decoder,
      });
      router.updateRoute("ur-assets", { decodeParams: null });

      expect(getConfig(router).decoders["ur-assets"]).toBeUndefined();
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
  });

  describe("encodeParams", () => {
    it("should add encodeParams", () => {
      const encoder = (params: Params): Params => ({
        ...params,
        id: params.id as string,
      });

      router.addRoute({ name: "ur-goods", path: "/ur-goods/:id" });
      router.updateRoute("ur-goods", { encodeParams: encoder });

      expect(getConfig(router).encoders["ur-goods"]).toBe(encoder);
    });

    it("should update existing encodeParams", () => {
      const encoder1 = (params: Params): Params => params;
      const encoder2 = (params: Params): Params => ({
        ...params,
        id: params.id as string,
      });

      router.addRoute({
        name: "ur-things",
        path: "/ur-things/:id",
        encodeParams: encoder1,
      });
      router.updateRoute("ur-things", { encodeParams: encoder2 });

      expect(getConfig(router).encoders["ur-things"]).toBe(encoder2);
    });

    it("should remove encodeParams when null", () => {
      const encoder = (params: Params): Params => params;

      router.addRoute({
        name: "ur-stuff",
        path: "/ur-stuff/:id",
        encodeParams: encoder,
      });
      router.updateRoute("ur-stuff", { encodeParams: null });

      expect(getConfig(router).encoders["ur-stuff"]).toBeUndefined();
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
  });

  describe("canActivate", () => {
    it("should add canActivate", () => {
      const guardFactory: ActivationFnFactory = () => () => true;

      router.addRoute({ name: "ur-secure", path: "/ur-secure" });
      router.updateRoute("ur-secure", { canActivate: guardFactory });

      const [, canActivateFactories] = router.getLifecycleFactories();

      expect(canActivateFactories["ur-secure"]).toBe(guardFactory);
    });

    it("should update existing canActivate", () => {
      const guard1: ActivationFnFactory = () => () => true;
      const guard2: ActivationFnFactory = () => () => false;

      router.addRoute({
        name: "ur-guarded",
        path: "/ur-guarded",
        canActivate: guard1,
      });
      router.updateRoute("ur-guarded", { canActivate: guard2 });

      const [, canActivateFactories] = router.getLifecycleFactories();

      expect(canActivateFactories["ur-guarded"]).toBe(guard2);
    });

    it("should remove canActivate when null", () => {
      const guardFactory: ActivationFnFactory = () => () => true;

      router.addRoute({
        name: "ur-locked",
        path: "/ur-locked",
        canActivate: guardFactory,
      });
      router.updateRoute("ur-locked", { canActivate: null });

      const [, canActivateFactories] = router.getLifecycleFactories();

      expect(canActivateFactories["ur-locked"]).toBeUndefined();
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
          // eslint-disable-next-line @typescript-eslint/require-await -- testing async rejection
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
          // eslint-disable-next-line @typescript-eslint/require-await -- testing async rejection
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
    it("should update multiple properties at once", () => {
      const decoder = (params: Params): Params => params;
      const guardFactory: ActivationFnFactory = () => () => true;

      router.addRoute({ name: "ur-multi", path: "/ur-multi" });
      router.updateRoute("ur-multi", {
        defaultParams: { page: 1 },
        decodeParams: decoder,
        canActivate: guardFactory,
      });

      expect(getConfig(router).defaultParams["ur-multi"]).toStrictEqual({
        page: 1,
      });
      expect(getConfig(router).decoders["ur-multi"]).toBe(decoder);

      const [, canActivateFactories] = router.getLifecycleFactories();

      expect(canActivateFactories["ur-multi"]).toBe(guardFactory);
    });

    it("should chain multiple updateRoute calls", () => {
      router.addRoute({ name: "ur-chain", path: "/ur-chain" });

      router
        .updateRoute("ur-chain", { defaultParams: { page: 1 } })
        .updateRoute("ur-chain", { defaultParams: { page: 2, limit: 10 } });

      expect(getConfig(router).defaultParams["ur-chain"]).toStrictEqual({
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
        children: [{ name: "child", path: "/:id" }],
      });

      router.updateRoute("ur-parent.child", { defaultParams: { tab: "info" } });

      expect(getConfig(router).defaultParams["ur-parent.child"]).toStrictEqual({
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
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

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
      router.navigate("ur-async", {}, {}, () => {});

      // Give time for navigation to start
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Verify navigation is in progress
      expect(router.isNavigating()).toBe(true);

      // Try to update during navigation - should log error but proceed
      router.updateRoute("ur-async", { defaultParams: { page: 1 } });

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringMatching(
          /\[router\.updateRoute\].*navigation is in progress/,
        ),
      );

      // Config should be updated (we only log error, don't block)
      expect(getConfig(router).defaultParams["ur-async"]).toStrictEqual({
        page: 1,
      });

      // Cleanup
      resolveCanActivate!();
      await new Promise((resolve) => setTimeout(resolve, 10));

      errorSpy.mockRestore();
    });

    it("should not log error when updating route without active navigation", () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      router.addRoute({ name: "ur-no-warn", path: "/ur-no-warn" });

      // No navigation in progress
      expect(router.isNavigating()).toBe(false);

      // Update should not log error
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

        // Config should remain unchanged
        expect(getConfig(router).defaultParams["ur-empty"]).toBeUndefined();
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
        expect(getConfig(router).defaultParams["ur-undef"]).toStrictEqual({
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
        expect(getConfig(router).defaultParams["ur-frozen"]).toStrictEqual({
          page: 1,
        });
      });

      it("should accept null prototype defaultParams", () => {
        router.addRoute({ name: "ur-nullproto", path: "/ur-nullproto" });

        const nullProtoParams = Object.create(null) as Params;

        nullProtoParams.page = 1;

        router.updateRoute("ur-nullproto", { defaultParams: nullProtoParams });

        // Use toEqual (not toStrictEqual) since stored object preserves null prototype
        // eslint-disable-next-line vitest/prefer-strict-equal -- intentional: null prototype vs Object prototype
        expect(getConfig(router).defaultParams["ur-nullproto"]).toEqual({
          page: 1,
        });
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

        const params = getConfig(router).defaultParams["ur-class"];

        expect(params).toMatchObject({ page: 1, limit: 10 });
      });

      it("should accept defaultParams with circular reference", () => {
        router.addRoute({ name: "ur-circular", path: "/ur-circular" });

        const circular: Params = { page: 1 };

        (circular as Record<string, unknown>).self = circular;

        // Should not throw on assignment
        expect(() =>
          router.updateRoute("ur-circular", { defaultParams: circular }),
        ).not.toThrowError();

        const stored = getConfig(router).defaultParams["ur-circular"];

        expect(stored).toBe(circular);
        expect((stored as Record<string, unknown>).self).toBe(circular);
      });

      it("should preserve Symbol keys in defaultParams (but may lose on copy)", () => {
        router.addRoute({ name: "ur-symbol", path: "/ur-symbol" });

        const sym = Symbol("hidden");
        const params = { page: 1, [sym]: "secret" };

        router.updateRoute("ur-symbol", { defaultParams: params });

        const stored = getConfig(router).defaultParams["ur-symbol"];

        expect(stored).toHaveProperty("page", 1);
        // Symbol key is preserved because we store reference
        expect((stored as typeof params)[sym]).toBe("secret");
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

      it("should accept arrow function as canActivate factory", () => {
        router.addRoute({ name: "ur-arrow-guard", path: "/ur-arrow-guard" });

        router.updateRoute("ur-arrow-guard", {
          canActivate: () => (_toState, _fromState, done) => {
            done();
          },
        });

        const [, factories] = router.getLifecycleFactories();

        expect(factories["ur-arrow-guard"]).toBeDefined();
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
        expect(getConfig(router).forwardMap["ur-atom-src"]).toBeUndefined();
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
        expect(getConfig(router).forwardMap["ur-atom-fwd"]).toBeUndefined();
        expect(getConfig(router).defaultParams["ur-atom-fwd"]).toBeUndefined();
      });
    });

    describe("sequential updates", () => {
      it("should replace (not merge) defaultParams on multiple updates", () => {
        router.addRoute({ name: "ur-seq", path: "/ur-seq" });

        router.updateRoute("ur-seq", { defaultParams: { a: 1, b: 2 } });
        router.updateRoute("ur-seq", { defaultParams: { c: 3 } });

        const params = getConfig(router).defaultParams["ur-seq"];

        // Should be replaced, not merged
        expect(params).toStrictEqual({ c: 3 });
        expect(params).not.toHaveProperty("a");
        expect(params).not.toHaveProperty("b");
      });

      it("should allow updating different properties independently", () => {
        router.addRoute({ name: "ur-indep", path: "/ur-indep" });

        router.updateRoute("ur-indep", { defaultParams: { page: 1 } });
        router.updateRoute("ur-indep", {
          decodeParams: (p) => ({ ...p, decoded: true }),
        });

        // Both should be set
        expect(getConfig(router).defaultParams["ur-indep"]).toStrictEqual({
          page: 1,
        });
        expect(getConfig(router).decoders["ur-indep"]).toBeDefined();
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
        const stored = getConfig(router).defaultParams["ur-getter"];

        expect(stored).toStrictEqual({ page: 1 });
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
        expect(getConfig(router).defaultParams["ur-throwing"]).toStrictEqual({
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
        expect(getConfig(router).defaultParams["ur-proxy"]).toStrictEqual({
          page: 1,
        });
      });
    });
  });
});
