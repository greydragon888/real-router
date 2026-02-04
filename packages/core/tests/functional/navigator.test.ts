import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { createTestRouter } from "../helpers";

import type { Router } from "@real-router/core";

let router: Router;

describe("core/getNavigator", () => {
  beforeEach(() => {
    router = createTestRouter();
    router.start("");
  });

  afterEach(() => {
    router.stop();
  });

  it("returns frozen object with exactly 4 methods", () => {
    const navigator = router.getNavigator();

    expect(Object.isFrozen(navigator)).toBe(true);
    expect(navigator).toHaveProperty("navigate");
    expect(navigator).toHaveProperty("getState");
    expect(navigator).toHaveProperty("isActiveRoute");
    expect(navigator).toHaveProperty("subscribe");
    expect(Object.keys(navigator)).toHaveLength(4);
  });

  it("returns same cached instance", () => {
    const nav1 = router.getNavigator();
    const nav2 = router.getNavigator();

    expect(nav1).toBe(nav2);
  });

  it("navigate works", () => {
    const navigator = router.getNavigator();
    const callback = vi.fn();

    navigator.navigate("users", {}, {}, callback);

    expect(callback).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ name: "users" }),
    );
  });

  it("getState works", () => {
    router.navigate("users.view", { id: "123" });
    const navigator = router.getNavigator();
    const state = navigator.getState();

    expect(state?.name).toBe("users.view");
    expect(state?.params).toStrictEqual({ id: "123" });
  });

  it("isActiveRoute works", () => {
    router.navigate("users.view", { id: "123" });
    const navigator = router.getNavigator();

    expect(navigator.isActiveRoute("users.view", { id: "123" })).toBe(true);
    expect(navigator.isActiveRoute("home")).toBe(false);
    expect(navigator.isActiveRoute("users.view", { id: "456" }, true)).toBe(
      false,
    );
  });

  it("subscribe works", () => {
    const navigator = router.getNavigator();
    const callback = vi.fn();
    const unsubscribe = navigator.subscribe(callback);

    navigator.navigate("users");

    expect(callback).toHaveBeenCalled();

    unsubscribe();
    navigator.navigate("home");

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("all methods are bound (work when destructured)", () => {
    const { navigate, getState, isActiveRoute, subscribe } =
      router.getNavigator();

    navigate("home");

    expect(getState()?.name).toBe("home");
    expect(isActiveRoute("home")).toBe(true);

    const unsubscribe = subscribe(() => {});

    expect(typeof unsubscribe).toBe("function");

    unsubscribe();
  });
});
