import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { cloneRouter } from "@real-router/core";

import { getNavigator } from "../../src/getNavigator";
import { createTestRouter } from "../helpers";

import type { Router } from "@real-router/core";

let router: Router;

describe("core/getNavigator", () => {
  beforeEach(async () => {
    router = createTestRouter();
    await router.start("/home");
  });

  afterEach(() => {
    router.stop();
  });

  it("returns frozen object with exactly 5 methods", () => {
    const navigator = getNavigator(router);

    expect(Object.isFrozen(navigator)).toBe(true);
    expect(navigator).toHaveProperty("navigate");
    expect(navigator).toHaveProperty("getState");
    expect(navigator).toHaveProperty("isActiveRoute");
    expect(navigator).toHaveProperty("canNavigateTo");
    expect(navigator).toHaveProperty("subscribe");
    expect(Object.keys(navigator)).toHaveLength(5);
  });

  it("returns new instance each call", () => {
    const nav1 = getNavigator(router);
    const nav2 = getNavigator(router);

    expect(nav1).not.toBe(nav2);
  });

  it("router does not have getNavigator method", () => {
    expect((router as any).getNavigator).toBeUndefined();
  });

  it("works with cloned router", () => {
    const cloned = cloneRouter(router);
    const nav = getNavigator(cloned);

    expect(nav.getState).toBeTypeOf("function");
    expect(nav.navigate).toBeTypeOf("function");
  });

  it("navigate works", async () => {
    const navigator = getNavigator(router);

    const state = await navigator.navigate("users", {});

    expect(state).toStrictEqual(expect.objectContaining({ name: "users" }));
  });

  it("getState works", async () => {
    await router.navigate("users.view", { id: "123" });
    const navigator = getNavigator(router);
    const state = navigator.getState();

    expect(state?.name).toBe("users.view");
    expect(state?.params).toStrictEqual({ id: "123" });
  });

  it("isActiveRoute works", async () => {
    await router.navigate("users.view", { id: "123" });
    const navigator = getNavigator(router);

    expect(navigator.isActiveRoute("users.view", { id: "123" })).toBe(true);
    expect(navigator.isActiveRoute("home")).toBe(false);
    expect(navigator.isActiveRoute("users.view", { id: "456" }, true)).toBe(
      false,
    );
  });

  it("subscribe works", async () => {
    const navigator = getNavigator(router);
    const callback = vi.fn();
    const unsubscribe = navigator.subscribe(callback);

    await navigator.navigate("users");

    expect(callback).toHaveBeenCalled();

    unsubscribe();
    await navigator.navigate("home");

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("canNavigateTo delegates to router.canNavigateTo()", () => {
    const navigator = getNavigator(router);

    expect(navigator.canNavigateTo("home")).toBe(true);
    expect(navigator.canNavigateTo("users")).toBe(true);
    expect(navigator.canNavigateTo("users.view", { id: "123" })).toBe(true);
    expect(navigator.canNavigateTo("nonexistent")).toBe(false);
  });

  it("all methods are bound (work when destructured)", async () => {
    const { navigate, getState, isActiveRoute, canNavigateTo, subscribe } =
      getNavigator(router);

    await navigate("users");

    expect(getState()?.name).toBe("users");
    expect(isActiveRoute("users")).toBe(true);
    expect(canNavigateTo("home")).toBe(true);

    const unsubscribe = subscribe(() => {});

    expect(typeof unsubscribe).toBe("function");

    unsubscribe();
  });
});
