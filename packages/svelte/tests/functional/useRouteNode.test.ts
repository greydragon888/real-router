import { getNavigator } from "@real-router/core";
import { getRoutesApi } from "@real-router/core/api";
import { flushSync } from "svelte";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

import {
  createTestRouterWithADefaultRouter,
  renderWithRouter,
} from "../helpers";
import RouteNodeCapture from "../helpers/RouteNodeCapture.svelte";

import type { RouteContext } from "../../src/types";
import type { Router } from "@real-router/core";

describe("useRouteNode", () => {
  let router: Router;

  beforeEach(() => {
    router = createTestRouterWithADefaultRouter();
  });

  afterEach(() => {
    router.stop();
  });

  it("should return the router context", () => {
    let result: RouteContext | undefined;

    renderWithRouter(router, RouteNodeCapture, {
      nodeName: "",
      onCapture: (r: RouteContext) => {
        result = r;
      },
    });

    expect(result!.navigator).toBe(getNavigator(router));
    expect(result!.route.current).toStrictEqual(undefined);
    expect(result!.previousRoute.current).toStrictEqual(undefined);
  });

  it("should not return a null route with a default route and the router started", async () => {
    let result: RouteContext | undefined;

    renderWithRouter(router, RouteNodeCapture, {
      nodeName: "",
      onCapture: (r: RouteContext) => {
        result = r;
      },
    });

    await router.start();
    flushSync();

    expect(result!.route.current?.name).toStrictEqual("test");
  });

  it("should change route if composable was subscribed to root node", async () => {
    let result: RouteContext | undefined;

    renderWithRouter(router, RouteNodeCapture, {
      nodeName: "",
      onCapture: (r: RouteContext) => {
        result = r;
      },
    });

    await router.start();
    flushSync();

    expect(result!.route.current?.name).toStrictEqual("test");

    await router.navigate("one-more-test");
    flushSync();

    expect(result!.route.current?.name).toStrictEqual("one-more-test");
  });

  it("should change route if composable was subscribed to changed node", async () => {
    let result: RouteContext | undefined;

    renderWithRouter(router, RouteNodeCapture, {
      nodeName: "items",
      onCapture: (r: RouteContext) => {
        result = r;
      },
    });

    await router.start();
    flushSync();

    expect(result!.route.current?.name).toStrictEqual(undefined);

    await router.navigate("items");
    flushSync();

    expect(result!.route.current?.name).toStrictEqual("items");

    await router.navigate("items.item", { id: 6 });
    flushSync();

    expect(result!.route.current?.name).toStrictEqual("items.item");
    expect(result!.route.current?.params).toStrictEqual({ id: 6 });

    await router.navigate("items");
    flushSync();

    expect(result!.route.current?.name).toStrictEqual("items");
    expect(result!.route.current?.params).toStrictEqual({});
  });

  it("should update only when node is affected", async () => {
    let result: RouteContext | undefined;

    renderWithRouter(router, RouteNodeCapture, {
      nodeName: "users",
      onCapture: (r: RouteContext) => {
        result = r;
      },
    });

    await router.start();
    flushSync();

    expect(result!.route.current).toBeUndefined();

    await router.navigate("home");
    flushSync();

    expect(result!.route.current).toBeUndefined();

    await router.navigate("users.list");
    flushSync();

    expect(result!.route.current?.name).toBe("users.list");

    await router.navigate("users.view", { id: "123" });
    flushSync();

    expect(result!.route.current?.name).toBe("users.view");

    await router.navigate("home");
    flushSync();

    expect(result!.route.current).toBeUndefined();
  });

  it("should handle node becoming inactive and active again", async () => {
    let result: RouteContext | undefined;

    renderWithRouter(router, RouteNodeCapture, {
      nodeName: "users",
      onCapture: (r: RouteContext) => {
        result = r;
      },
    });

    await router.start();
    await router.navigate("users.view", { id: "123" });
    flushSync();

    expect(result!.route.current?.name).toBe("users.view");

    await router.navigate("home");
    flushSync();

    expect(result!.route.current).toBeUndefined();
    expect(result!.previousRoute.current?.name).toBe("users.view");

    await router.navigate("users.list");
    flushSync();

    expect(result!.route.current?.name).toBe("users.list");
    expect(result!.previousRoute.current?.name).toBe("home");
  });

  it("should handle deeply nested node correctly", async () => {
    getRoutesApi(router).add([
      {
        name: "admin",
        path: "/admin",
        children: [
          {
            name: "settings",
            path: "/settings",
            children: [{ name: "security", path: "/security" }],
          },
        ],
      },
    ]);

    let result: RouteContext | undefined;

    renderWithRouter(router, RouteNodeCapture, {
      nodeName: "admin.settings",
      onCapture: (r: RouteContext) => {
        result = r;
      },
    });

    await router.start();
    await router.navigate("admin");
    flushSync();

    expect(result!.route.current).toBeUndefined();

    await router.navigate("admin.settings");
    flushSync();

    expect(result!.route.current?.name).toBe("admin.settings");

    await router.navigate("admin.settings.security");
    flushSync();

    expect(result!.route.current?.name).toBe("admin.settings.security");
  });

  it("should throw error if router instance was not passed to provider", () => {
    expect(() =>
      renderWithRouter(undefined as unknown as Router, RouteNodeCapture, {
        nodeName: "",
        onCapture: () => {},
      }),
    ).toThrow();
  });

  // Documents gotcha #9 from CLAUDE.md: previousRoute is GLOBAL, not node-scoped.
  // After navigating users.list → items → users.view, previousRoute observed by
  // useRouteNode("users") must equal "items" (the last global route), NOT "users.list".
  it("should expose the global previous route, not the previous route within the node scope", async () => {
    let result: RouteContext | undefined;

    renderWithRouter(router, RouteNodeCapture, {
      nodeName: "users",
      onCapture: (r: RouteContext) => {
        result = r;
      },
    });

    await router.start();
    await router.navigate("users.list");
    flushSync();

    expect(result!.route.current?.name).toBe("users.list");

    await router.navigate("items");
    flushSync();

    // Node "users" deactivated; previous remains the last route the node observed.
    expect(result!.route.current).toBeUndefined();

    await router.navigate("users.view", { id: "42" });
    flushSync();

    // Critical: previousRoute reflects the global previous route ("items"),
    // NOT the previous "users.*" route ("users.list").
    expect(result!.route.current?.name).toBe("users.view");
    expect(result!.previousRoute.current?.name).toBe("items");
  });
});
