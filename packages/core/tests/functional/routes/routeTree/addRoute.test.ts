import { logger } from "@real-router/logger";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { createRouter, getPluginApi } from "@real-router/core";

import { createTestRouter } from "../../../helpers";

import type {
  GuardFnFactory,
  Params,
  Route,
  Router,
  RouterError,
} from "@real-router/core";

let router: Router;

describe("core/routes/addRoute", () => {
  beforeEach(async () => {
    router = createTestRouter();
    await router.start("/home");
  });

  afterEach(() => {
    router.stop();
  });

  it("should sort routes correctly on add", async () => {
    router.addRoute([{ name: "setting", path: "/setting" }]);

    const path = router.buildPath("setting");

    expect(path).toBe("/setting");
  });

  it("should sort routes correctly for batch add", async () => {
    router.addRoute([
      { name: "c", path: "/c" },
      { name: "a", path: "/a" },
      { name: "b", path: "/b" },
    ]);

    // Verify all routes are accessible (sorting is automatic)
    expect(getPluginApi(router).matchPath("/a")?.name).toBe("a");
    expect(getPluginApi(router).matchPath("/b")?.name).toBe("b");
    expect(getPluginApi(router).matchPath("/c")?.name).toBe("c");
  });

  it("should match routes after add and navigate", async () => {
    router.addRoute([{ name: "new-route", path: "/new" }]);

    // navigate works correctly
    await router.navigate("new-route");

    expect(router.getState()?.name).toBe("new-route");
  });

  it("should check isActiveRoute after add", async () => {
    router.addRoute([{ name: "check-route", path: "/check" }]);

    // Navigate to the route first
    await router.navigate("check-route");

    // isActiveRoute works correctly
    expect(router.isActiveRoute("check-route")).toBe(true);
  });

  it("should register canActivate function if defined on route", async () => {
    router.addRoute([
      {
        name: "secure",
        path: "/secure",
        canActivate: () => () => false, // blocking guard
      },
    ]);

    // Verify guard is registered by testing navigation behavior
    try {
      await router.navigate("secure");

      expect.fail("Should have thrown");
    } catch (error) {
      expect((error as RouterError).code).toBe("CANNOT_ACTIVATE");
    }
  });

  it("should register forwardTo and redirect during navigation", async () => {
    router.addRoute([
      {
        name: "old-route",
        path: "/old",
        forwardTo: "new-route",
      },
      {
        name: "new-route",
        path: "/new",
      },
    ]);

    // forwardState follows the forward rule and returns the resolved state
    const state = getPluginApi(router).forwardState("old-route", {});

    expect(state.name).toBe("new-route"); // Redirect happened
  });

  it("should register decodeParams and call it during matchPath", async () => {
    const decodeParams = vi.fn((params) => ({ ...params, decoded: true }));

    router.addRoute([
      {
        name: "item",
        path: "/item/:id",
        decodeParams,
      },
    ]);

    const state = getPluginApi(router).matchPath("/item/123");

    // Test behavior: decodeParams was called and transformed the params
    expect(decodeParams).toHaveBeenCalledWith({ id: "123" });
    expect(state?.params).toStrictEqual({ id: "123", decoded: true });
  });

  it("should register encodeParams and call it during buildPath", async () => {
    const encodeParams = vi.fn((params) => ({ ...params, encoded: true }));

    router.addRoute([
      {
        name: "item",
        path: "/item/:id",
        encodeParams,
      },
    ]);

    router.buildPath("item", { id: "123" });

    // Test behavior: encodeParams was called
    expect(encodeParams).toHaveBeenCalledWith({ id: "123" });
  });

  it("should use fallback params when decodeParams returns undefined (line 100)", async () => {
    const decodeParams = vi.fn(() => undefined as any);

    router.addRoute([
      {
        name: "decode-fallback",
        path: "/decode-fallback/:id",
        decodeParams,
      },
    ]);

    const state = getPluginApi(router).matchPath("/decode-fallback/123");

    expect(decodeParams).toHaveBeenCalledWith({ id: "123" });
    // Falls back to original params when decodeParams returns undefined
    expect(state?.params).toStrictEqual({ id: "123" });
  });

  it("should use fallback params when encodeParams returns undefined (line 105)", async () => {
    const encodeParams = vi.fn(() => undefined as any);

    router.addRoute([
      {
        name: "encode-fallback",
        path: "/encode-fallback/:id",
        encodeParams,
      },
    ]);

    const path = router.buildPath("encode-fallback", { id: "456" });

    expect(encodeParams).toHaveBeenCalledWith({ id: "456" });
    // Falls back to original params when encodeParams returns undefined
    expect(path).toBe("/encode-fallback/456");
  });

  it("should validate nested children before adding (invalid name type)", async () => {
    expect(() => {
      router.addRoute({
        name: "parent-test-1",
        path: "/parent-test-1",
        children: [{ name: 123 as unknown as string, path: "/invalid" }],
      });
    }).toThrowError("[router.addRoute] Route name must be a string");
  });

  it("should throw when route name is empty string", async () => {
    expect(() => {
      router.addRoute({
        name: "",
        path: "/empty-name",
      });
    }).toThrowError(/Route name cannot be empty/i);
  });

  it("should validate deeply nested children", async () => {
    expect(() => {
      router.addRoute({
        name: "deep-a",
        path: "/deep-a",
        children: [
          {
            name: "deep-b",
            path: "/deep-b",
            children: [{ name: null as unknown as string, path: "/c" }],
          },
        ],
      });
    }).toThrowError(TypeError);
  });

  it("should throw if route is not an object", async () => {
    expect(() => {
      router.addRoute(null as unknown as []);
    }).toThrowError("[router.addRoute] Route must be an object, got null");

    expect(() => {
      router.addRoute("string-route" as unknown as []);
    }).toThrowError("[router.addRoute] Route must be an object, got string");
  });

  it("should throw if children is not an array", async () => {
    expect(() => {
      router.addRoute({
        name: "parent-test-2",
        path: "/parent-test-2",
        children: "not-an-array" as unknown as [],
      });
    }).toThrowError(
      '[router.addRoute] Route "parent-test-2" children must be an array',
    );
  });

  it("should add route with valid children successfully", async () => {
    router.addRoute({
      name: "valid-section",
      path: "/valid-section",
      children: [
        { name: "page", path: "/page" },
        { name: "other", path: "/other" },
      ],
    });

    const path = router.buildPath("valid-section.page");

    expect(path).toBe("/valid-section/page");
  });

  it("should throw on duplicate route name", async () => {
    router.addRoute({ name: "dup-test", path: "/dup-test" });

    expect(() => {
      router.addRoute({ name: "dup-test", path: "/other" });
    }).toThrowError('[router.addRoute] Route "dup-test" already exists');
  });

  it("should throw on duplicate name within same batch (cross-batch detection)", async () => {
    expect(() => {
      router.addRoute([
        { name: "batch-dup", path: "/batch-dup-1" },
        { name: "batch-dup", path: "/batch-dup-2" },
      ]);
    }).toThrowError('[router.addRoute] Duplicate route "batch-dup" in batch');
  });

  it("should throw on duplicate before modifying config (atomicity)", async () => {
    router.addRoute({ name: "first-dup", path: "/first-dup" });

    expect(() => {
      router.addRoute([
        {
          name: "new-before-dup",
          path: "/new-before-dup",
          canActivate: () => () => true,
        },
        { name: "first-dup", path: "/first-dup" },
      ]);
    }).toThrowError('[router.addRoute] Route "first-dup" already exists');

    // new-before-dup should NOT be registered (atomicity preserved)
    expect(router.hasRoute("new-before-dup")).toBe(false);
  });

  it("should throw on duplicate nested child route", async () => {
    router.addRoute({
      name: "dup-parent",
      path: "/dup-parent",
      children: [{ name: "child", path: "/child" }],
    });

    expect(() => {
      router.addRoute(
        { name: "child", path: "/other" },
        { parent: "dup-parent" },
      );
    }).toThrowError(
      '[router.addRoute] Route "dup-parent.child" already exists',
    );
  });

  it("should reject batch on path conflict (pre-validation atomicity)", async () => {
    router.addRoute({
      name: "path-conflict-existing",
      path: "/path-conflict",
    });

    expect(() => {
      router.addRoute([
        {
          name: "pre-validation-test",
          path: "/pre-validation-test",
          canActivate: () => () => true,
          decodeParams: (p) => p,
        },
        { name: "conflict-route", path: "/path-conflict" },
      ]);
    }).toThrowError(
      '[router.addRoute] Path "/path-conflict" is already defined',
    );

    // pre-validation-test should NOT be registered (pre-validation rejects entire batch)
    expect(router.hasRoute("pre-validation-test")).toBe(false);
  });

  it("should throw on duplicate path within same batch", async () => {
    expect(() => {
      router.addRoute([
        { name: "batch-path-a", path: "/same-path" },
        { name: "batch-path-b", path: "/same-path" },
      ]);
    }).toThrowError('[router.addRoute] Path "/same-path" is already defined');
  });

  describe("children handlers registration", () => {
    it("should register canActivate for children routes", async () => {
      router.addRoute({
        name: "parent",
        path: "/parent",
        children: [
          {
            name: "child",
            path: "/child",
            canActivate: () => () => false, // blocking guard
          },
        ],
      });

      // Verify guard is registered by testing navigation behavior
      try {
        await router.navigate("parent.child");

        expect.fail("Should have thrown");
      } catch (error) {
        expect((error as RouterError).code).toBe("CANNOT_ACTIVATE");
      }
    });

    it("should register canActivate for deeply nested children", async () => {
      router.addRoute({
        name: "level1",
        path: "/level1",
        children: [
          {
            name: "level2",
            path: "/level2",
            canActivate: () => () => false, // blocking guard
            children: [
              {
                name: "level3",
                path: "/level3",
                canActivate: () => () => true, // allowing guard
              },
            ],
          },
        ],
      });

      // level2 guard blocks navigation to level2
      try {
        await router.navigate("level1.level2");

        expect.fail("Should have thrown");
      } catch (error) {
        expect((error as RouterError).code).toBe("CANNOT_ACTIVATE");
      }

      // level2 guard also blocks navigation to level3 (parent guard runs first)
      try {
        await router.navigate("level1.level2.level3");

        expect.fail("Should have thrown");
      } catch (error) {
        expect((error as RouterError).code).toBe("CANNOT_ACTIVATE");
      }
    });

    it("should register forwardTo for children routes", async () => {
      router.addRoute({ name: "target", path: "/target" });

      router.addRoute({
        name: "container",
        path: "/container",
        children: [
          {
            name: "redirect",
            path: "/redirect",
            forwardTo: "target",
          },
        ],
      });

      // forwardState follows the forward rule for nested routes
      const state = getPluginApi(router).forwardState("container.redirect", {});

      expect(state.name).toBe("target");
    });

    it("should register decodeParams for children routes", async () => {
      const childDecoder = vi.fn((params) => ({
        ...params,
        childDecoded: true,
      }));

      router.addRoute({
        name: "api",
        path: "/api",
        children: [
          {
            name: "resource",
            path: "/resource/:id",
            decodeParams: childDecoder,
          },
        ],
      });

      const state = getPluginApi(router).matchPath("/api/resource/123");

      expect(childDecoder).toHaveBeenCalledWith({ id: "123" });
      expect(state?.params).toStrictEqual({ id: "123", childDecoded: true });
    });

    it("should register encodeParams for children routes", async () => {
      const childEncoder = vi.fn((params) => ({
        ...params,
        childEncoded: true,
      }));

      router.addRoute({
        name: "api",
        path: "/api",
        children: [
          {
            name: "item",
            path: "/item/:id",
            encodeParams: childEncoder,
          },
        ],
      });

      router.buildPath("api.item", { id: "456" });

      expect(childEncoder).toHaveBeenCalledWith({ id: "456" });
    });

    it("should register defaultParams for children routes", async () => {
      router.addRoute({
        name: "search",
        path: "/search",
        children: [
          {
            name: "results",
            path: "/results",
            defaultParams: { page: 1, limit: 10 },
          },
        ],
      });

      // Default params should be applied when creating state without params
      const state = getPluginApi(router).makeState("search.results");

      expect(state.params).toStrictEqual({ page: 1, limit: 10 });
    });

    it("should register all handlers for parent and children in same call", async () => {
      let parentGuardCalled = false;
      let childGuardCalled = false;

      router.addRoute({
        name: "wrapper",
        path: "/wrapper",
        canActivate: () => () => {
          parentGuardCalled = true;

          return true;
        },
        defaultParams: { parentParam: "value" },
        children: [
          {
            name: "inner",
            path: "/inner",
            canActivate: () => () => {
              childGuardCalled = true;

              return true;
            },
            defaultParams: { childParam: "value" },
          },
        ],
      });

      // Navigate to inner to trigger both guards
      await router.navigate("wrapper.inner");

      expect(parentGuardCalled).toBe(true);
      expect(childGuardCalled).toBe(true);

      // Default params should be applied when creating state without params
      // Note: makeState only applies the route's OWN defaultParams, not ancestors'
      const wrapperState = getPluginApi(router).makeState("wrapper");
      const innerState = getPluginApi(router).makeState("wrapper.inner");

      expect(wrapperState.params).toStrictEqual({ parentParam: "value" });
      expect(innerState.params).toStrictEqual({ childParam: "value" });
    });
  });

  describe("{ parent } option", () => {
    it("should add route with { parent } option when parent exists", () => {
      router.addRoute({ name: "products", path: "/products" });

      router.addRoute({ name: "detail", path: "/:id" }, { parent: "products" });

      expect(router.hasRoute("products.detail")).toBe(true);
      expect(router.buildPath("products.detail", { id: "123" })).toBe(
        "/products/123",
      );
    });

    it("should throw when { parent } option references non-existent parent", () => {
      expect(() => {
        router.addRoute(
          { name: "orphan", path: "/orphan" },
          { parent: "nonexistent" },
        );
      }).toThrowError(
        '[router.addRoute] Parent route "nonexistent" does not exist',
      );
    });

    it("should add multiple routes with same { parent } in batch", () => {
      router.addRoute({ name: "dashboard", path: "/dashboard" });

      router.addRoute(
        [
          { name: "widgets", path: "/widgets" },
          { name: "charts", path: "/charts" },
        ],
        { parent: "dashboard" },
      );

      expect(router.hasRoute("dashboard.widgets")).toBe(true);
      expect(router.hasRoute("dashboard.charts")).toBe(true);
    });

    it("should support nested parent names (fullName) in { parent } option", () => {
      router.addRoute({
        name: "shop",
        path: "/shop",
        children: [{ name: "category", path: "/:category" }],
      });

      router.addRoute(
        { name: "items", path: "/items" },
        { parent: "shop.category" },
      );

      expect(router.hasRoute("shop.category.items")).toBe(true);
      expect(
        router.buildPath("shop.category.items", { category: "books" }),
      ).toBe("/shop/books/items");
    });

    it("should correctly resolve navigation after adding route with { parent }", async () => {
      router.addRoute({ name: "products", path: "/products" });

      router.addRoute({ name: "detail", path: "/:id" }, { parent: "products" });

      const state = await router.navigate("products.detail", { id: "42" });

      expect(state.name).toBe("products.detail");
      expect(state.params.id).toBe("42");
      expect(state.path).toBe("/products/42");
    });

    it("should correctly build path after adding route with { parent }", () => {
      router.addRoute({ name: "api", path: "/api" });

      router.addRoute({ name: "v1", path: "/v1" }, { parent: "api" });

      const path = router.buildPath("api.v1");

      expect(path).toBe("/api/v1");
    });

    it("should validate { parent } option value", () => {
      expect(() => {
        router.addRoute(
          { name: "child", path: "/child" },
          { parent: "" as any },
        );
      }).toThrowError(TypeError);

      expect(() => {
        router.addRoute(
          { name: "child", path: "/child" },
          { parent: 123 as any },
        );
      }).toThrowError(TypeError);
    });
  });

  describe("dot-notation rejection", () => {
    it("should throw TypeError when route name contains dots", () => {
      expect(() => {
        router.addRoute({ name: "users.profile", path: "/:id" });
      }).toThrowError(TypeError);
    });

    it("should include helpful error message for dot-notation", () => {
      expect(() => {
        router.addRoute({ name: "users.profile", path: "/:id" });
      }).toThrowError(
        '[router.addRoute] Route name "users.profile" cannot contain dots. Use children array or { parent } option in addRoute() instead.',
      );
    });

    it("should reject multi-level dot-notation", () => {
      expect(() => {
        router.addRoute({ name: "a.b.c", path: "/c" });
      }).toThrowError(TypeError);

      expect(() => {
        router.addRoute({ name: "a.b.c", path: "/c" });
      }).toThrowError(/cannot contain dots/);
    });
  });

  describe("encodeParams/decodeParams validation", () => {
    it("should throw when decodeParams is not a function", async () => {
      expect(() => {
        router.addRoute({
          name: "bad-decoder",
          path: "/bad-decoder",

          decodeParams: "not a function" as any,
        });
      }).toThrowError(/decodeparams must be a function/i);
    });

    it("should throw when encodeParams is not a function", async () => {
      expect(() => {
        router.addRoute({
          name: "bad-encoder",
          path: "/bad-encoder",

          encodeParams: { wrong: "type" } as any,
        });
      }).toThrowError(/encodeparams must be a function/i);
    });

    it("should throw when decodeParams is null", async () => {
      expect(() => {
        router.addRoute({
          name: "null-decoder",
          path: "/null-decoder",

          decodeParams: null as any,
        });
      }).toThrowError(/decodeparams must be a function/i);
    });

    it("should accept valid function for decodeParams", async () => {
      expect(() => {
        router.addRoute({
          name: "valid-decoder",
          path: "/valid-decoder/:id",
          decodeParams: (params) => ({ ...params, decoded: true }),
        });
      }).not.toThrowError();
    });

    it("should accept valid function for encodeParams", async () => {
      expect(() => {
        router.addRoute({
          name: "valid-encoder",
          path: "/valid-encoder/:id",
          encodeParams: (params) => ({ ...params, encoded: true }),
        });
      }).not.toThrowError();
    });

    it("should validate encodeParams/decodeParams in children", async () => {
      expect(() => {
        router.addRoute({
          name: "parent-with-bad-child",
          path: "/parent",
          children: [
            {
              name: "bad-child",
              path: "/child",

              decodeParams: 123 as any,
            },
          ],
        });
      }).toThrowError(/decodeparams must be a function/i);
    });

    it("should throw when decodeParams is an async function", async () => {
      expect(() => {
        router.addRoute({
          name: "async-decoder",
          path: "/async-decoder/:id",
          decodeParams: (async (params: Params) => params) as any,
        });
      }).toThrowError(/decodeparams cannot be async/i);
    });

    it("should throw when encodeParams is an async function", async () => {
      expect(() => {
        router.addRoute({
          name: "async-encoder",
          path: "/async-encoder/:id",
          encodeParams: (async (params: Params) => params) as any,
        });
      }).toThrowError(/encodeparams cannot be async/i);
    });
  });

  describe("empty children handling", () => {
    it("should preserve empty children array in route object", async () => {
      const route = {
        name: "parent-with-empty-children",
        path: "/parent",
        children: [] as Route[],
      };

      router.addRoute(route);

      // Empty children should be preserved in the route object
      expect(route).toHaveProperty("children");
      expect(route.children).toStrictEqual([]);
      // But the route should work correctly
      expect(getPluginApi(router).matchPath("/parent")).toBeDefined();
    });

    it("should preserve empty children in nested routes", async () => {
      const nestedRoute = {
        name: "nested",
        path: "/nested",
        children: [] as Route[],
      };

      const route = {
        name: "root",
        path: "/root",
        children: [nestedRoute],
      };

      router.addRoute(route);

      // Empty children should be preserved
      expect(nestedRoute).toHaveProperty("children");
      expect(nestedRoute.children).toStrictEqual([]);
      // But routes should work correctly
      expect(getPluginApi(router).matchPath("/root/nested")).toBeDefined();
    });

    it("should preserve undefined children in route object", async () => {
      const route = {
        name: "no-children",
        path: "/no-children",
        children: undefined,
      } as any;

      router.addRoute(route);

      // undefined children should be preserved
      expect(route.children).toBeUndefined();
      // But route should work correctly
      expect(getPluginApi(router).matchPath("/no-children")).toBeDefined();
    });

    it("should work with frozen routes with empty children", async () => {
      const frozenRoute = Object.freeze({
        name: "frozen",
        path: "/frozen",
        children: [] as Route[],
      });

      // Should not throw when adding frozen route
      expect(() => {
        router.addRoute(frozenRoute);
      }).not.toThrowError();

      // Route should work correctly
      expect(getPluginApi(router).matchPath("/frozen")).toBeDefined();
      // Original object unchanged
      expect(frozenRoute.children).toStrictEqual([]);
    });

    it("should keep non-empty children", async () => {
      const route = {
        name: "parent-ok",
        path: "/parent-ok",
        children: [{ name: "child", path: "/child" }],
      };

      router.addRoute(route);

      expect(route).toHaveProperty("children");
      expect(route.children).toHaveLength(1);
      expect(getPluginApi(router).matchPath("/parent-ok/child")).toBeDefined();
    });
  });

  describe("forwardTo chain resolution", () => {
    it("should resolve simple forwardTo chain (A → B → C)", async () => {
      router.addRoute([
        { name: "A", path: "/a", forwardTo: "B" },
        { name: "B", path: "/b", forwardTo: "C" },
        { name: "C", path: "/c" },
      ]);

      // forwardState should resolve the full chain to C
      const state = getPluginApi(router).forwardState("A", {});

      expect(state.name).toBe("C");
    });

    it("should handle route without forwardTo", async () => {
      router.addRoute({ name: "no-forward", path: "/no-forward" });

      const state = getPluginApi(router).forwardState("no-forward", {});

      expect(state.name).toBe("no-forward");
    });

    it("should detect circular forwardTo (A → B → A)", async () => {
      expect(() => {
        router.addRoute([
          { name: "A", path: "/a", forwardTo: "B" },
          { name: "B", path: "/b", forwardTo: "A" },
        ]);
      }).toThrowError(/Circular forwardTo: A → B → A/);
    });

    it("should detect circular forwardTo (A → B → C → B)", async () => {
      expect(() => {
        router.addRoute([
          { name: "A", path: "/a", forwardTo: "B" },
          { name: "B", path: "/b", forwardTo: "C" },
          { name: "C", path: "/c", forwardTo: "B" },
        ]);
      }).toThrowError(/Circular forwardTo: B → C → B/);
    });

    it("should detect self-referencing forwardTo (A → A)", async () => {
      expect(() => {
        router.addRoute({ name: "A", path: "/a", forwardTo: "A" });
      }).toThrowError(/Circular forwardTo: A → A/);
    });

    it("should allow forwardTo if target exists in same batch", async () => {
      router.addRoute([
        { name: "redirect", path: "/redirect", forwardTo: "target" },
        { name: "target", path: "/target" },
      ]);

      const state = getPluginApi(router).forwardState("redirect", {});

      expect(state.name).toBe("target");
    });

    it("should allow forwardTo if target already exists", async () => {
      router.addRoute({ name: "existing", path: "/existing" });

      router.addRoute({
        name: "new-redirect",
        path: "/new",
        forwardTo: "existing",
      });

      const state = getPluginApi(router).forwardState("new-redirect", {});

      expect(state.name).toBe("existing");
    });

    it("should handle forwardTo after removeRoute target", async () => {
      router.addRoute([
        { name: "A", path: "/a", forwardTo: "B" },
        { name: "B", path: "/b" },
      ]);

      // A forwards to B
      expect(getPluginApi(router).forwardState("A", {}).name).toBe("B");

      // Remove B - now A has dangling forwardTo
      router.removeRoute("B");

      // forwardState should return A itself since B no longer exists
      expect(getPluginApi(router).forwardState("A", {}).name).toBe("A");
    });

    it("should resolve forwardTo chains correctly", async () => {
      router.addRoute([
        { name: "level1", path: "/1", forwardTo: "level2" },
        { name: "level2", path: "/2", forwardTo: "level3" },
        { name: "level3", path: "/3", forwardTo: "level4" },
        { name: "level4", path: "/4", forwardTo: "final" },
        { name: "final", path: "/final" },
      ]);

      // All levels should resolve to "final"
      expect(getPluginApi(router).forwardState("level1", {}).name).toBe(
        "final",
      );
      expect(getPluginApi(router).forwardState("level2", {}).name).toBe(
        "final",
      );
      expect(getPluginApi(router).forwardState("level3", {}).name).toBe(
        "final",
      );
      expect(getPluginApi(router).forwardState("level4", {}).name).toBe(
        "final",
      );
    });

    it("should handle very long chains without stack overflow", async () => {
      // Create a chain of 50 routes
      const routes: Route[] = [];

      for (let i = 1; i < 50; i++) {
        routes.push({
          name: `route${i}`,
          path: `/route${i}`,
          forwardTo: `route${i + 1}`,
        });
      }

      // Last route has no forwardTo
      routes.push({
        name: "route50",
        path: "/route50",
      });

      router.addRoute(routes);

      // First route should resolve to last route
      const state = getPluginApi(router).forwardState("route1", {});

      expect(state.name).toBe("route50");
    });

    it("should reject chain exceeding maximum depth", async () => {
      // Create a chain exceeding default maxDepth (100)
      const routes: Route[] = [];

      for (let i = 1; i < 101; i++) {
        routes.push({
          name: `deep${i}`,
          path: `/deep${i}`,
          forwardTo: `deep${i + 1}`,
        });
      }

      // Last route has no forwardTo
      routes.push({
        name: "deep101",
        path: "/deep101",
      });

      expect(() => {
        router.addRoute(routes);
      }).toThrowError(/forwardTo chain exceeds maximum depth/);
    });

    it("should handle forwardTo with nested routes", async () => {
      router.addRoute([
        { name: "old", path: "/old", forwardTo: "new.page" },
        {
          name: "new",
          path: "/new",
          children: [{ name: "page", path: "/page" }],
        },
      ]);

      const state = getPluginApi(router).forwardState("old", {});

      expect(state.name).toBe("new.page");
    });

    it("should preserve params when forwarding", async () => {
      router.addRoute([
        { name: "redirect", path: "/redirect/:id", forwardTo: "target" },
        { name: "target", path: "/target/:id" },
      ]);

      const state = getPluginApi(router).forwardState("redirect", {
        id: "123",
      });

      expect(state.name).toStrictEqual("target");
      expect(state.params).toStrictEqual({ id: "123" });
    });

    it("should preserve splat params when forwarding", async () => {
      // First add target route with splat param to tree
      router.addRoute({ name: "newfiles", path: "/newfiles/*filepath" });

      // Then add source route with forwardTo - this triggers getRequiredParams on existing tree
      router.addRoute({
        name: "files",
        path: "/files/*filepath",
        forwardTo: "newfiles",
      });

      const state = getPluginApi(router).forwardState("files", {
        filepath: "docs/readme.md",
      });

      expect(state.name).toBe("newfiles");
      expect(state.params).toStrictEqual({ filepath: "docs/readme.md" });
    });

    it("should throw if forwardTo target is missing required params", async () => {
      // Target route requires :id param, but source has no params
      expect(() => {
        router.addRoute([
          { name: "noparams", path: "/noparams", forwardTo: "withparams" },
          { name: "withparams", path: "/withparams/:id" },
        ]);
      }).toThrowError(
        /forwardTo target.*requires params.*not available in source/,
      );
    });

    it("should allow adding forwards dynamically via updateRoute()", async () => {
      router.addRoute([
        { name: "oldRoute", path: "/old" },
        { name: "newRoute", path: "/new" },
      ]);

      // Use updateRoute() API to dynamically add a redirect
      router.updateRoute("oldRoute", { forwardTo: "newRoute" });

      // Verify behavior: forwardState should follow the new rule
      const state = getPluginApi(router).forwardState("oldRoute", {});

      expect(state.name).toBe("newRoute");
    });

    it("should warn when route has both forwardTo and canActivate", async () => {
      // Spy on console.warn
      const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

      router.addRoute([
        {
          name: "redirectWithGuard",
          path: "/redirect",
          forwardTo: "target",
          canActivate: () => () => true, // Factory returns middleware - will be ignored!
        },
        { name: "target", path: "/target" },
      ]);

      expect(warnSpy).toHaveBeenCalledWith(
        "real-router",
        expect.stringContaining("forwardTo and canActivate"),
      );
      expect(warnSpy).toHaveBeenCalledWith(
        "real-router",
        expect.stringContaining("redirectWithGuard"),
      );
      expect(warnSpy).toHaveBeenCalledWith(
        "real-router",
        expect.stringContaining('target route "target"'),
      );

      warnSpy.mockRestore();
    });

    it("should not warn when route has only forwardTo without canActivate", async () => {
      const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

      router.addRoute([
        { name: "redirect", path: "/redirect", forwardTo: "target" },
        { name: "target", path: "/target" },
      ]);

      expect(warnSpy).not.toHaveBeenCalled();

      warnSpy.mockRestore();
    });
  });

  describe("Edge cases", () => {
    it("should handle empty batch addRoute([])", async () => {
      // Should not throw when adding empty array
      expect(() => {
        router.addRoute([]);
      }).not.toThrowError();
    });

    it("should allow addRoute on stopped router", async () => {
      router.stop();

      // Should not throw
      expect(() => {
        router.addRoute({ name: "after-stop", path: "/after-stop" });
      }).not.toThrowError();

      // Route should be registered
      await router.start("/home");

      expect(getPluginApi(router).matchPath("/after-stop")?.name).toBe(
        "after-stop",
      );
    });

    it("should handle child route with forwardTo to sibling", async () => {
      router.addRoute({
        name: "container",
        path: "/container",
        children: [
          {
            name: "sibling1",
            path: "/sibling1",
            forwardTo: "container.sibling2",
          },
          { name: "sibling2", path: "/sibling2" },
        ],
      });

      const state = getPluginApi(router).forwardState("container.sibling1", {});

      expect(state.name).toBe("container.sibling2");
    });

    it("should handle route with query parameters in path", async () => {
      router.addRoute({
        name: "search",
        path: "/search?q&page&sort",
      });

      const state = getPluginApi(router).matchPath(
        "/search?q=test&page=1&sort=asc",
      );

      expect(state?.name).toBe("search");
      expect(state?.params.q).toBe("test");
      expect(state?.params.page).toBe("1");
      expect(state?.params.sort).toBe("asc");
    });

    it("should handle route with all options combined", async () => {
      const canActivate = vi.fn(() => () => true);
      const nestedCanActivate = vi.fn(() => () => true);
      const decodeParams = vi.fn((p) => ({ ...p, decoded: true }));
      const encodeParams = vi.fn((p) => ({ ...p, encoded: true }));

      router.addRoute({ name: "target", path: "/target/:id" });

      router.addRoute({
        name: "complete",
        path: "/complete/:id",
        canActivate,
        decodeParams,
        encodeParams,
        defaultParams: { id: "default" },
        forwardTo: "target",
        children: [
          {
            name: "nested",
            path: "/nested",
            canActivate: nestedCanActivate,
          },
        ],
      });

      // Verify canActivate registration by checking factory was called
      // (factory is invoked during registration to compile the guard)
      expect(canActivate).toHaveBeenCalled();
      expect(nestedCanActivate).toHaveBeenCalled();

      // Verify decodeParams works
      const matchedState = getPluginApi(router).matchPath("/complete/123");

      expect(decodeParams).toHaveBeenCalledWith({ id: "123" });
      expect(matchedState?.params).toStrictEqual({ id: "123", decoded: true });

      // Verify encodeParams works
      router.buildPath("complete", { id: "456" });

      expect(encodeParams).toHaveBeenCalledWith({ id: "456" });

      // Verify defaultParams works
      const defaultState = getPluginApi(router).makeState("complete");

      expect(defaultState.params).toStrictEqual({ id: "default" });

      // Verify forwardTo works
      const forwardedState = getPluginApi(router).forwardState("complete", {
        id: "789",
      });

      expect(forwardedState.name).toBe("target");
    });

    it("should handle adding route to deeply nested parent via { parent } option", async () => {
      router.addRoute({
        name: "level1",
        path: "/level1",
        children: [
          {
            name: "level2",
            path: "/level2",
            children: [
              {
                name: "level3",
                path: "/level3",
              },
            ],
          },
        ],
      });

      // Add a child to level3 via { parent } option with nested fullName
      router.addRoute(
        {
          name: "level4",
          path: "/level4",
        },
        { parent: "level1.level2.level3" },
      );

      expect(
        getPluginApi(router).matchPath("/level1/level2/level3/level4")?.name,
      ).toBe("level1.level2.level3.level4");
    });

    it("should handle route path with optional query params", async () => {
      router.addRoute({
        name: "docs",
        path: "/docs?section",
      });

      // With query param
      expect(getPluginApi(router).matchPath("/docs?section=intro")?.name).toBe(
        "docs",
      );
      expect(
        getPluginApi(router).matchPath("/docs?section=intro")?.params.section,
      ).toBe("intro");

      // Without query param
      expect(getPluginApi(router).matchPath("/docs")?.name).toBe("docs");
    });

    it("should handle route path with splat/wildcard", async () => {
      router.addRoute({
        name: "files",
        path: "/files/*path",
      });

      const state = getPluginApi(router).matchPath("/files/docs/readme.md");

      expect(state?.name).toBe("files");
      expect(state?.params.path).toBe("docs/readme.md");
    });

    it("should handle multiple routes with same prefix", async () => {
      router.addRoute([
        { name: "products", path: "/products" },
        { name: "products-list", path: "/products/list" },
        { name: "products-detail", path: "/products/:id" },
      ]);

      expect(getPluginApi(router).matchPath("/products")?.name).toBe(
        "products",
      );
      expect(getPluginApi(router).matchPath("/products/list")?.name).toBe(
        "products-list",
      );
      expect(getPluginApi(router).matchPath("/products/123")?.name).toBe(
        "products-detail",
      );
    });

    it("should handle forwardTo chain added in multiple batches", async () => {
      router.addRoute({ name: "final", path: "/final" });
      router.addRoute({
        name: "middle",
        path: "/middle",
        forwardTo: "final",
      });
      router.addRoute({
        name: "start",
        path: "/start",
        forwardTo: "middle",
      });

      // Chain resolves correctly: start → middle → final
      expect(getPluginApi(router).forwardState("start", {}).name).toBe("final");
      expect(getPluginApi(router).forwardState("middle", {}).name).toBe(
        "final",
      );
    });
  });

  describe("Error handling validation gaps", () => {
    describe("Problem 1: forwardTo target validation", () => {
      it("should throw if forwardTo target does not exist", async () => {
        // Current behavior: route is added but forwardTo is invalid
        // Expected behavior: should throw during addRoute
        expect(() => {
          router.addRoute({
            name: "redirect",
            path: "/redirect",
            forwardTo: "nonexistent-target",
          });
        }).toThrowError(/forwardto target .* does not exist/i);
      });

      it("should throw if forwardTo target does not exist in batch", async () => {
        expect(() => {
          router.addRoute([
            { name: "a", path: "/a", forwardTo: "ghost" },
            { name: "b", path: "/b" },
          ]);
        }).toThrowError(/forwardto target .* does not exist/i);
      });
    });

    describe("Problem 2: canActivate type validation", () => {
      it("should throw if canActivate is not a function", async () => {
        expect(() => {
          router.addRoute({
            name: "bad-guard",
            path: "/bad-guard",
            canActivate: "not a function" as any,
          });
        }).toThrowError(/canactivate must be a function/i);
      });

      it("should throw if canActivate is null", async () => {
        expect(() => {
          router.addRoute({
            name: "null-guard",
            path: "/null-guard",
            canActivate: null as any,
          });
        }).toThrowError(/canactivate must be a function/i);
      });

      it("should throw if canActivate is an object", async () => {
        expect(() => {
          router.addRoute({
            name: "object-guard",
            path: "/object-guard",
            canActivate: { handler: () => true } as any,
          });
        }).toThrowError(/canactivate must be a function/i);
      });
    });

    describe("canDeactivate type validation", () => {
      it("should throw if canDeactivate is not a function", async () => {
        expect(() => {
          router.addRoute({
            name: "bad-deactivate-guard",
            path: "/bad-deactivate-guard",
            canDeactivate: "not a function" as any,
          });
        }).toThrowError(/candeactivate must be a function/i);
      });

      it("should throw if canDeactivate is null", async () => {
        expect(() => {
          router.addRoute({
            name: "null-deactivate-guard",
            path: "/null-deactivate-guard",
            canDeactivate: null as any,
          });
        }).toThrowError(/candeactivate must be a function/i);
      });

      it("should throw if canDeactivate is an object", async () => {
        expect(() => {
          router.addRoute({
            name: "object-deactivate-guard",
            path: "/object-deactivate-guard",
            canDeactivate: { handler: () => true } as any,
          });
        }).toThrowError(/candeactivate must be a function/i);
      });
    });

    describe("Problem 3: defaultParams type validation", () => {
      it("should throw if defaultParams is not an object", async () => {
        expect(() => {
          router.addRoute({
            name: "bad-defaults",
            path: "/bad-defaults",
            defaultParams: "not an object" as any,
          });
        }).toThrowError(/defaultparams must be an object/i);
      });

      it("should throw if defaultParams is null", async () => {
        expect(() => {
          router.addRoute({
            name: "null-defaults",
            path: "/null-defaults",
            defaultParams: null as any,
          });
        }).toThrowError(/defaultparams must be an object/i);
      });

      it("should throw if defaultParams is an array", async () => {
        expect(() => {
          router.addRoute({
            name: "array-defaults",
            path: "/array-defaults",
            defaultParams: ["a", "b"] as any,
          });
        }).toThrowError(/defaultparams must be an object/i);
      });
    });

    describe("Problem 5: invalid path type", () => {
      it("should throw if path is not a string (number)", async () => {
        expect(() => {
          router.addRoute({
            name: "bad-path",
            path: 123 as unknown as string,
          });
        }).toThrowError(/path must be a string/i);
      });

      it("should throw if path is null", async () => {
        expect(() => {
          router.addRoute({
            name: "null-path",
            path: null as unknown as string,
          });
        }).toThrowError(/path must be a string/i);
      });
    });

    describe("Problem 6: forwardTo to self", () => {
      it("should detect self-referencing forwardTo as cycle", async () => {
        expect(() => {
          router.addRoute({
            name: "self-ref",
            path: "/self",
            forwardTo: "self-ref",
          });
        }).toThrowError(/circular forwardto/i);
      });
    });

    describe("Problem 4: atomicity on Phase 4 errors", () => {
      it("should not add routes to definitions if forwardTo cycle is detected", async () => {
        expect(() => {
          router.addRoute([
            { name: "cycle-a", path: "/cycle-a", forwardTo: "cycle-b" },
            { name: "cycle-b", path: "/cycle-b", forwardTo: "cycle-a" },
          ]);
        }).toThrowError(/Circular forwardTo/);

        // Routes should NOT be registered (atomicity)
        expect(router.hasRoute("cycle-a")).toBe(false);
        expect(router.hasRoute("cycle-b")).toBe(false);
      });

      it("should not register handlers if forwardTo cycle is detected", async () => {
        expect(() => {
          router.addRoute([
            {
              name: "cycle-with-guard-a",
              path: "/cycle-guard-a",
              forwardTo: "cycle-with-guard-b",
              canActivate: () => () => true,
            },
            {
              name: "cycle-with-guard-b",
              path: "/cycle-guard-b",
              forwardTo: "cycle-with-guard-a",
            },
          ]);
        }).toThrowError(/Circular forwardTo/);

        // Routes should NOT be registered (atomicity)
        expect(router.hasRoute("cycle-with-guard-a")).toBe(false);
        expect(router.hasRoute("cycle-with-guard-b")).toBe(false);
      });
    });
  });

  describe("path validation", () => {
    it("should throw on path with spaces", async () => {
      expect(() => {
        router.addRoute({ name: "spacey", path: "/with space" });
      }).toThrowError(/whitespace not allowed/);
    });

    it("should throw on path with tabs", async () => {
      expect(() => {
        router.addRoute({ name: "tabby", path: "/with\ttab" });
      }).toThrowError(/whitespace not allowed/);
    });

    it("should throw on path with newlines", async () => {
      expect(() => {
        router.addRoute({ name: "newline", path: "/with\nnewline" });
      }).toThrowError(/whitespace not allowed/);
    });

    it("should allow path without whitespace", async () => {
      expect(() => {
        router.addRoute({ name: "clean", path: "/clean-path" });
      }).not.toThrowError();
    });
  });

  describe("plain object validation", () => {
    it("should throw on route with getter", async () => {
      const routeWithGetter = {
        get name(): string {
          return "getter-route";
        },
        path: "/getter",
      };

      expect(() => {
        router.addRoute(routeWithGetter as Route);
      }).toThrowError(/must not have getters or setters/);
    });

    it("should throw on route with setter", async () => {
      let _name = "setter-route";
      const routeWithSetter = {
        get name(): string {
          return _name;
        },
        set name(value: string) {
          _name = value;
        },
        path: "/setter",
      };

      expect(() => {
        router.addRoute(routeWithSetter as Route);
      }).toThrowError(/must not have getters or setters/);
    });

    it("should throw on class instance route", async () => {
      class RouteClass {
        name = "class-route";
        path = "/class";
      }

      expect(() => {
        router.addRoute(new RouteClass() as Route);
      }).toThrowError(/must be a plain object/);
    });

    it("should allow Object.create(null) route", async () => {
      const nullProtoRoute = Object.create(null) as Route;

      nullProtoRoute.name = "null-proto";
      nullProtoRoute.path = "/null-proto";

      expect(() => {
        router.addRoute(nullProtoRoute);
      }).not.toThrowError();
    });

    it("should allow plain object route", async () => {
      expect(() => {
        router.addRoute({ name: "plain", path: "/plain" });
      }).not.toThrowError();
    });
  });

  describe("array mutation protection", () => {
    it("should handle array copy for Proxy protection", async () => {
      const routes = [
        { name: "proxy-a", path: "/proxy-a" },
        { name: "proxy-b", path: "/proxy-b" },
      ];

      // Verify routes are added correctly even if original array is mutated after
      router.addRoute(routes);
      routes.push({ name: "proxy-c", path: "/proxy-c" });

      // Only first two routes should be added
      expect(getPluginApi(router).matchPath("/proxy-a")?.name).toBe("proxy-a");
      expect(getPluginApi(router).matchPath("/proxy-b")?.name).toBe("proxy-b");
      expect(getPluginApi(router).matchPath("/proxy-c")).toBeUndefined();
    });

    it("should protect against mutations between validation and registration", async () => {
      // Attack scenario: External code mutates original array between
      // validation phase and registration phase of addRoute
      //
      // Protection mechanism: [...addedRoutes] creates a snapshot,
      // so all phases work with the same frozen state

      const routes = [
        { name: "valid-a", path: "/valid-a" },
        { name: "valid-b", path: "/valid-b" },
      ];

      // Simulate external mutation after addRoute starts
      // In real attack, this could be async code or Proxy
      const originalPush = routes.push.bind(routes);

      routes.push = function (...items) {
        // This mutation happens, but copy was already made
        return originalPush(...items);
      };

      router.addRoute(routes);

      // Now mutate the original array
      routes.push({ name: "injected", path: "/injected" });

      // Only original routes should be in router
      expect(getPluginApi(router).matchPath("/valid-a")?.name).toBe("valid-a");
      expect(getPluginApi(router).matchPath("/valid-b")?.name).toBe("valid-b");
      expect(getPluginApi(router).matchPath("/injected")).toBeUndefined();

      // Original array was mutated but router is unaffected
      expect(routes).toHaveLength(3);
    });

    it("should isolate from array-like object mutations", async () => {
      // Verify that spread operator creates independent copy
      const routes = [{ name: "original", path: "/original" }];

      router.addRoute(routes);

      // Mutate original
      routes[0] = { name: "mutated", path: "/mutated" };
      routes.push({ name: "added", path: "/added" });

      // Router should have the original route (shallow copy protects array structure)
      // Note: shallow copy doesn't protect against object property mutations
      // but it does protect against array structure changes
      expect(getPluginApi(router).matchPath("/original")?.name).toBe(
        "original",
      );
      expect(getPluginApi(router).matchPath("/added")).toBeUndefined();
    });
  });

  describe("forwardTo function", () => {
    it("should register forwardTo callback and resolve dynamically", async () => {
      const routerWithDeps = createRouter(
        [
          {
            name: "dashboard",
            path: "/dashboard",
            forwardTo: (getDep) =>
              getDep("user").isAdmin ? "admin-dash" : "user-dash",
          },
          { name: "admin-dash", path: "/admin-dash" },
          { name: "user-dash", path: "/user-dash" },
        ],
        { defaultRoute: "admin-dash" },
        { user: { isAdmin: true } },
      );

      await routerWithDeps.start("").catch(() => {});

      const result = getPluginApi(routerWithDeps).forwardState("dashboard", {});

      expect(result.name).toBe("admin-dash");

      routerWithDeps.stop();
    });

    it("should reject async forwardTo callback (native async)", async () => {
      expect(() => {
        router.addRoute({
          name: "async-forward",
          path: "/async-forward",
          forwardTo: (async () => "target") as any,
        });
      }).toThrowError(TypeError);

      expect(() => {
        router.addRoute({
          name: "async-forward",
          path: "/async-forward",
          forwardTo: (async () => "target") as any,
        });
      }).toThrowError(/cannot be async/);
    });

    it("should reject async forwardTo callback (transpiled async with __awaiter)", async () => {
      // Simulate transpiled async function with __awaiter in toString()

      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      const transpiledAsync = new Function(
        "return function() { return __awaiter(this, void 0, void 0, function*() { return 'target'; }); }",
      )();

      expect(() => {
        router.addRoute({
          name: "transpiled-async-forward",
          path: "/transpiled-async-forward",
          forwardTo: transpiledAsync,
        });
      }).toThrowError(TypeError);

      expect(() => {
        router.addRoute({
          name: "transpiled-async-forward",
          path: "/transpiled-async-forward",
          forwardTo: transpiledAsync,
        });
      }).toThrowError(/cannot be async/);
    });
  });

  describe("canDeactivate", () => {
    it("should add canDeactivate that blocks navigation", async () => {
      const guard = vi.fn().mockReturnValue(false);
      const guardFactory: GuardFnFactory = () => guard;

      router.addRoute({
        name: "editor",
        path: "/editor",
        canDeactivate: guardFactory,
      });

      // Navigate TO route (should succeed)
      await router.navigate("editor");

      expect(router.getState()?.name).toBe("editor");

      guard.mockClear();

      // Navigate AWAY from route (should fail)
      try {
        await router.navigate("home");

        expect.fail("Should have thrown");
      } catch (error) {
        expect((error as RouterError).code).toBe("CANNOT_DEACTIVATE");
        expect(guard).toHaveBeenCalled();
        expect(router.getState()?.name).toBe("editor"); // Still on editor
      }
    });

    it("should add canDeactivate that allows navigation", async () => {
      const guard = vi.fn().mockReturnValue(true);
      const guardFactory: GuardFnFactory = () => guard;

      router.addRoute({
        name: "form",
        path: "/form",
        canDeactivate: guardFactory,
      });

      // Navigate TO route
      await router.navigate("form");

      guard.mockClear();

      // Navigate AWAY from route (should succeed)
      await router.navigate("home");

      expect(guard).toHaveBeenCalled();
      expect(router.getState()?.name).toBe("home");
    });

    it("should fire canDeactivate for all nested levels in reverse order", async () => {
      const parentGuard = vi.fn().mockReturnValue(true);
      const childGuard = vi.fn().mockReturnValue(true);

      router.addRoute({
        name: "dashboard",
        path: "/dashboard",
        canDeactivate: () => parentGuard,
        children: [
          {
            name: "settings",
            path: "/settings",
            canDeactivate: () => childGuard,
          },
        ],
      });

      // Navigate to child
      await router.navigate("dashboard.settings");

      parentGuard.mockClear();
      childGuard.mockClear();

      // Navigate away - both guards should fire, child first
      await router.navigate("home");

      // Both guards were called
      expect(childGuard).toHaveBeenCalled();
      expect(parentGuard).toHaveBeenCalled();

      // Child guard called before parent (reverse order)
      const childCallOrder = childGuard.mock.invocationCallOrder[0];
      const parentCallOrder = parentGuard.mock.invocationCallOrder[0];

      expect(childCallOrder).toBeLessThan(parentCallOrder);
    });

    it("should allow addDeactivateGuard to overwrite route config canDeactivate", async () => {
      const guard1 = vi.fn().mockReturnValue(false);
      const guard2 = vi.fn().mockReturnValue(true);

      router.addRoute({
        name: "workspace",
        path: "/workspace",
        canDeactivate: () => guard1,
      });

      // Overwrite with addDeactivateGuard
      router.addDeactivateGuard("workspace", () => guard2);

      // Navigate to route
      await router.navigate("workspace");

      guard1.mockClear();
      guard2.mockClear();

      // Navigate away - guard2 should fire, guard1 should NOT
      await router.navigate("home");

      expect(guard2).toHaveBeenCalled();
      expect(guard1).not.toHaveBeenCalled();
    });

    it("should return canDeactivate from getRoute() after addRoute", async () => {
      const guardFactory: GuardFnFactory = () => () => true;

      router.addRoute({
        name: "account-settings",
        path: "/account-settings",
        canDeactivate: guardFactory,
      });

      const route = router.getRoute("account-settings");

      expect(route).toBeDefined();
      expect(route?.canDeactivate).toBe(guardFactory);
    });

    it("should register canDeactivate from constructor routes (pending flush)", async () => {
      const guard = vi.fn().mockReturnValue(false);
      const guardFactory: GuardFnFactory = () => guard;

      // Create router with canDeactivate in constructor
      const testRouter = createRouter([
        { name: "home", path: "/" },
        { name: "users", path: "/users" },
        {
          name: "document",
          path: "/document",
          canDeactivate: guardFactory,
        },
      ]);

      // Start router - this flushes pendingCanDeactivate
      await testRouter.start("/");

      // Navigate to document
      await testRouter.navigate("document");

      guard.mockClear();

      // Navigate away - canDeactivate should fire (proves flush worked)
      try {
        await testRouter.navigate("home");

        expect.fail("Should have thrown");
      } catch (error) {
        expect((error as RouterError).code).toBe("CANNOT_DEACTIVATE");
        expect(guard).toHaveBeenCalled();
      }

      testRouter.stop();
    });

    it("should warn when route has both forwardTo and canDeactivate", async () => {
      const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

      router.addRoute([
        {
          name: "old-page",
          path: "/old-page",
          forwardTo: "new-page",
          canDeactivate: () => () => true, // Will be ignored
        },
        { name: "new-page", path: "/new-page" },
      ]);

      expect(warnSpy).toHaveBeenCalledWith(
        "real-router",
        expect.stringContaining("forwardTo and canDeactivate"),
      );
      expect(warnSpy).toHaveBeenCalledWith(
        "real-router",
        expect.stringContaining("old-page"),
      );

      warnSpy.mockRestore();
    });
  });
});
