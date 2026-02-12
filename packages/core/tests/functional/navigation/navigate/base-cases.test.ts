import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { createTestRouter, omitMeta } from "../../../helpers";

import type { Router } from "@real-router/core";

let router: Router;

describe("router.navigate() - base cases", () => {
  beforeEach(() => {
    router = createTestRouter();

    void router.start();
  });

  afterEach(() => {
    router.stop();

    vi.clearAllMocks();
  });

  it("should be able to navigate to routes", async () => {
    await router.navigate("users.view", { id: 123 });

    expect(omitMeta(router.getState())).toStrictEqual({
      name: "users.view",
      params: { id: 123 },
      path: "/users/view/123",
    });

    await router.navigate("index");

    expect(router.getState()?.name).toBe("index");
    expect(router.getState()?.path).toBe("/");
  });

  it("should allow navigation to the same route with different params", async () => {
    await router.navigate("orders.view", { id: 1 });

    expect(router.getState()?.params.id).toBe(1);

    await router.navigate("orders.view", { id: 2 });

    expect(router.getState()?.params.id).toBe(2);
  });

  it("should handle navigation to nested route with params", async () => {
    await router.navigate("orders.view", { id: 42 });

    const state = router.getState();

    expect(state?.name).toBe("orders.view");
    expect(state?.params.id).toBe(42);
    expect(state?.path).toBe("/orders/view/42");
  });

  it("should extend default params", async () => {
    await router.navigate("withDefaultParam");

    expect(router.getState()?.params).toStrictEqual({
      param: "hello",
    });
  });

  it("should encode params to path", async () => {
    await router.navigate("withEncoder", { one: "un", two: "deux" });

    expect(router.getState()?.path).toStrictEqual("/encoded/un/deux");
  });

  it("should encode and decode params using encodeParams/decodeParams", async () => {
    await router.navigate("withEncoder", { one: "one", two: "two" });

    expect(router.getState()?.path).toBe("/encoded/one/two");

    const matched = router.matchPath("/encoded/one/two");

    expect(matched?.params).toStrictEqual({ one: "one", two: "two" });
  });

  it("should not throw if method is called with more than 4 args", () => {
    const done = vi.fn();

    expect(
      () =>
        // @ts-expect-error - Testing extra arguments are ignored
        void router.navigate("index", {}, {}, done, 123),
    ).not.toThrowError();
  });

  it("should be able to call navigate with 3 args without done cb", async () => {
    await router.navigate("orders.pending", {}, { force: true });

    expect(router.getState()?.name).toBe("orders.pending");
  });
});
