import { getRoutesApi } from "@real-router/core/api";
import { flushSync } from "svelte";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

import {
  createTestRouterWithADefaultRouter,
  renderWithRouter,
} from "../helpers";
import ActiveRouteCapture from "../helpers/ActiveRouteCapture.svelte";

import type { Router } from "@real-router/core";

describe("useIsActiveRoute", () => {
  let router: Router;

  beforeEach(async () => {
    router = createTestRouterWithADefaultRouter();
    await router.start("/users/123");
  });

  afterEach(() => {
    router.stop();
  });

  it("should check if route is active", () => {
    let result!: { readonly current: boolean };

    renderWithRouter(router, ActiveRouteCapture, {
      routeName: "users.view",
      routeParams: { id: "123" },
      onCapture: (r: { readonly current: boolean }) => {
        result = r;
      },
    });

    expect(result.current).toBe(true);
  });

  it("should handle non-strict mode", () => {
    let result!: { readonly current: boolean };

    renderWithRouter(router, ActiveRouteCapture, {
      routeName: "users",
      routeParams: {},
      strict: false,
      onCapture: (r: { readonly current: boolean }) => {
        result = r;
      },
    });

    expect(result.current).toBe(true);
  });

  it("should handle strict mode", () => {
    let result!: { readonly current: boolean };

    renderWithRouter(router, ActiveRouteCapture, {
      routeName: "users",
      routeParams: {},
      strict: true,
      onCapture: (r: { readonly current: boolean }) => {
        result = r;
      },
    });

    expect(result.current).toBe(false);
  });

  it("should update when route changes", async () => {
    let result!: { readonly current: boolean };

    renderWithRouter(router, ActiveRouteCapture, {
      routeName: "users.view",
      routeParams: { id: "123" },
      onCapture: (r: { readonly current: boolean }) => {
        result = r;
      },
    });

    expect(result.current).toBe(true);

    await router.navigate("home");
    flushSync();

    expect(result.current).toBe(false);
  });

  it("should handle empty parameters", async () => {
    router.stop();
    await router.start("/users/list");

    let result!: { readonly current: boolean };

    renderWithRouter(router, ActiveRouteCapture, {
      routeName: "users.list",
      routeParams: {},
      onCapture: (r: { readonly current: boolean }) => {
        result = r;
      },
    });

    expect(result.current).toBe(true);
  });

  it("should distinguish routes by query params when ignoreQueryParams is false", async () => {
    // Navigate to items.item with query param
    await router.navigate("items.item", { id: "6", page: "1" });
    flushSync();

    let result!: { readonly current: boolean };

    renderWithRouter(router, ActiveRouteCapture, {
      routeName: "items.item",
      routeParams: { id: "6", page: "1" },
      strict: true,
      ignoreQueryParams: false,
      onCapture: (r: { readonly current: boolean }) => {
        result = r;
      },
    });

    // Exact match with same query params — should be active
    expect(result.current).toBe(true);

    // Navigate to the same route but different query params
    await router.navigate("items.item", { id: "6", page: "2" });
    flushSync();

    // With ignoreQueryParams=false, different query params → NOT active
    expect(result.current).toBe(false);
  });

  it("should ignore query params by default (ignoreQueryParams=true)", async () => {
    // Navigate to items.item with query param
    await router.navigate("items.item", { id: "6", page: "1" });
    flushSync();

    let result!: { readonly current: boolean };

    renderWithRouter(router, ActiveRouteCapture, {
      routeName: "items.item",
      routeParams: { id: "6" },
      ignoreQueryParams: true,
      onCapture: (r: { readonly current: boolean }) => {
        result = r;
      },
    });

    expect(result.current).toBe(true);

    // Navigate to the same route with different query params
    await router.navigate("items.item", { id: "6", page: "2" });
    flushSync();

    // With ignoreQueryParams=true, different query params → still active
    expect(result.current).toBe(true);
  });

  it("should correctly check parent route with nested active route", async () => {
    getRoutesApi(router).add([
      {
        name: "settings",
        path: "/settings",
        children: [
          {
            name: "profile",
            path: "/profile",
            children: [{ name: "edit", path: "/edit" }],
          },
        ],
      },
    ]);

    await router.navigate("settings.profile.edit");
    flushSync();

    let nonStrictResult!: { readonly current: boolean };

    renderWithRouter(router, ActiveRouteCapture, {
      routeName: "settings",
      routeParams: {},
      strict: false,
      onCapture: (r: { readonly current: boolean }) => {
        nonStrictResult = r;
      },
    });

    expect(nonStrictResult.current).toBe(true);

    let strictResult!: { readonly current: boolean };

    renderWithRouter(router, ActiveRouteCapture, {
      routeName: "settings",
      routeParams: {},
      strict: true,
      onCapture: (r: { readonly current: boolean }) => {
        strictResult = r;
      },
    });

    expect(strictResult.current).toBe(false);
  });

  it("an empty routeName is inactive — agrees with router.isActiveRoute('') (#1427)", () => {
    // #1427 — an empty routeName is a misuse (matches no route). The canonical
    // answer is router.isActiveRoute("") === false; the hook must agree. Before
    // the guard, "" took the name-selector fast path where isActive("") === true
    // (root is every route's ancestor). createActiveSource's routeName !== ""
    // guard routes "" to the slow path (snapshot = router.isActiveRoute("")).
    expect(router.isActiveRoute("")).toBe(false);

    let result!: { readonly current: boolean };

    renderWithRouter(router, ActiveRouteCapture, {
      routeName: "",
      onCapture: (r: { readonly current: boolean }) => {
        result = r;
      },
    });

    expect(result.current).toBe(false);
  });

  describe("fast path (#1099 — default options, no params)", () => {
    // A no-params call with defaults (strict=false, ignoreQueryParams=true, no
    // hash) takes the `createActiveNameSelector` fast path — one shared router
    // subscription for all links — instead of a per-link
    // `createActiveRouteSource`. These lock the fast path's observable
    // behaviour: exact + descendant matches, inactive names, and reactive
    // updates on navigation. (beforeEach started the router at /users/123 →
    // current route "users.view".)
    it("exact name match is active", () => {
      let result!: { readonly current: boolean };

      renderWithRouter(router, ActiveRouteCapture, {
        routeName: "users.view",
        onCapture: (r: { readonly current: boolean }) => {
          result = r;
        },
      });

      expect(result.current).toBe(true);
    });

    it("ancestor name is active (non-strict descendant match)", () => {
      let result!: { readonly current: boolean };

      renderWithRouter(router, ActiveRouteCapture, {
        routeName: "users",
        onCapture: (r: { readonly current: boolean }) => {
          result = r;
        },
      });

      expect(result.current).toBe(true);
    });

    it("unrelated name is inactive, then turns active after navigating to it", async () => {
      let result!: { readonly current: boolean };

      renderWithRouter(router, ActiveRouteCapture, {
        routeName: "home",
        onCapture: (r: { readonly current: boolean }) => {
          result = r;
        },
      });

      expect(result.current).toBe(false);

      await router.navigate("home");
      flushSync();

      expect(result.current).toBe(true);
    });
  });
});
