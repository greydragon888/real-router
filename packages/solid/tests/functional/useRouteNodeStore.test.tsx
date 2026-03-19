import { getRoutesApi } from "@real-router/core/api";
import { renderHook } from "@solidjs/testing-library";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { RouterProvider, useRouteNodeStore } from "@real-router/solid";

import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router } from "@real-router/core";
import type { JSX } from "solid-js";

const wrapper = (router: Router) => (props: { children: JSX.Element }) => (
  <RouterProvider router={router}>{props.children}</RouterProvider>
);

describe("useRouteNodeStore hook", () => {
  let router: Router;

  beforeEach(async () => {
    router = createTestRouterWithADefaultRouter();

    await router.start();
  });

  afterEach(() => {
    router.stop();
  });

  it("should return route state for matching node", async () => {
    const { result } = renderHook(() => useRouteNodeStore("items"), {
      wrapper: wrapper(router),
    });

    expect(result.route).toBeUndefined();

    await router.navigate("items");

    expect(result.route?.name).toBe("items");
  });

  it("should return undefined route when node is not active", async () => {
    const { result } = renderHook(() => useRouteNodeStore("users"), {
      wrapper: wrapper(router),
    });

    expect(result.route).toBeUndefined();

    await router.navigate("home");

    expect(result.route).toBeUndefined();

    await router.navigate("users.list");

    expect(result.route?.name).toBe("users.list");

    await router.navigate("items");

    expect(result.route).toBeUndefined();
  });

  it("should update only when specified node changes", async () => {
    const { result } = renderHook(() => useRouteNodeStore("items"), {
      wrapper: wrapper(router),
    });

    await router.navigate("items.item", { id: "1" });

    expect(result.route?.name).toBe("items.item");
    expect(result.route?.params.id).toBe("1");

    await router.navigate("items.item", { id: "2" });

    expect(result.route?.name).toBe("items.item");
    expect(result.route?.params.id).toBe("2");

    await router.navigate("users.list");

    expect(result.route).toBeUndefined();

    await router.navigate("items");

    expect(result.route?.name).toBe("items");
  });

  it("should track previousRoute for the node", async () => {
    const { result } = renderHook(() => useRouteNodeStore("users"), {
      wrapper: wrapper(router),
    });

    expect(result.previousRoute).toBeUndefined();

    await router.navigate("users.list");

    expect(result.route?.name).toBe("users.list");

    await router.navigate("users.view", { id: "123" });

    expect(result.route?.name).toBe("users.view");
    expect(result.previousRoute?.name).toBe("users.list");

    await router.navigate("home");

    expect(result.route).toBeUndefined();
    expect(result.previousRoute?.name).toBe("users.view");
  });

  it("should handle node becoming inactive and active again", async () => {
    const { result } = renderHook(() => useRouteNodeStore("users"), {
      wrapper: wrapper(router),
    });

    await router.navigate("users.view", { id: "123" });

    expect(result.route?.name).toBe("users.view");

    await router.navigate("home");

    expect(result.route).toBeUndefined();
    expect(result.previousRoute?.name).toBe("users.view");

    await router.navigate("users.list");

    expect(result.route?.name).toBe("users.list");
    expect(result.previousRoute?.name).toBe("home");
  });

  it("should handle deeply nested nodes", async () => {
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

    const { result } = renderHook(() => useRouteNodeStore("admin.settings"), {
      wrapper: wrapper(router),
    });

    await router.navigate("admin");

    expect(result.route).toBeUndefined();

    await router.navigate("admin.settings");

    expect(result.route?.name).toBe("admin.settings");

    await router.navigate("admin.settings.security");

    expect(result.route?.name).toBe("admin.settings.security");

    await router.navigate("home");

    expect(result.route).toBeUndefined();
  });

  it("should handle parallel nodes independently", async () => {
    const { result: usersResult } = renderHook(
      () => useRouteNodeStore("users"),
      {
        wrapper: wrapper(router),
      },
    );
    const { result: itemsResult } = renderHook(
      () => useRouteNodeStore("items"),
      {
        wrapper: wrapper(router),
      },
    );

    await router.navigate("users.list");

    expect(usersResult.route?.name).toBe("users.list");
    expect(itemsResult.route).toBeUndefined();

    await router.navigate("items.item", { id: "1" });

    expect(usersResult.route).toBeUndefined();
    expect(itemsResult.route?.name).toBe("items.item");

    await router.navigate("users.view", { id: "456" });

    expect(usersResult.route?.name).toBe("users.view");
    expect(itemsResult.route).toBeUndefined();
  });

  it("should handle parameter changes within same node", async () => {
    const { result } = renderHook(() => useRouteNodeStore("users"), {
      wrapper: wrapper(router),
    });

    await router.navigate("users.view", { id: "1" });

    expect(result.route?.name).toBe("users.view");
    expect(result.route?.params.id).toBe("1");

    await router.navigate("users.view", { id: "2" });

    expect(result.route?.name).toBe("users.view");
    expect(result.route?.params.id).toBe("2");
    expect(result.previousRoute?.name).toBe("users.view");
    expect(result.previousRoute?.params.id).toBe("1");
  });

  it("should handle reload option correctly", async () => {
    const { result } = renderHook(() => useRouteNodeStore("users"), {
      wrapper: wrapper(router),
    });

    await router.navigate("users.list");

    const initialRouteName = result.route?.name;

    await router.navigate("users.list", {}, { reload: true });

    expect(result.route?.name).toBe("users.list");
    expect(result.route?.name).toBe(initialRouteName);
  });

  it("should throw error if router instance was not passed to provider", () => {
    expect(() => renderHook(() => useRouteNodeStore("users"))).toThrow();
  });

  it("should handle root node subscription", async () => {
    const { result } = renderHook(() => useRouteNodeStore(""), {
      wrapper: wrapper(router),
    });

    await router.navigate("items");

    expect(result.route?.name).toBe("items");

    await router.navigate("users.view", { id: "123" });

    expect(result.route?.name).toBe("users.view");
  });
});
