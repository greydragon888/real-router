import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { createTestRouter, omitMeta } from "../../../helpers";

import type { Router } from "@real-router/core";

let router: Router;

describe("router.navigate() - query params", () => {
  beforeEach(() => {
    router = createTestRouter();

    void router.start();
  });

  afterEach(() => {
    router.stop();

    vi.clearAllMocks();
  });

  it("should append query parameters to path", () => {
    void router.navigate("users.view", { id: 123, q: "search", page: "2" });

    expect(omitMeta(router.getState())).toMatchObject({
      name: "users.view",
      params: { id: 123 },
      path: "/users/view/123?q=search&page=2",
    });
  });

  it("should encode query parameters correctly", async () => {
    const state = await router.navigate("users.view", {
      id: 42,
      q: "a b",
      tag: "x/y",
    });

    expect(state?.path).toBe("/users/view/42?q=a%20b&tag=x%2Fy");
  });

  it("should handle empty query params correctly", () => {
    void router.navigate("users.view", { id: 42 });

    expect(router.getState()?.path).toBe("/users/view/42");
  });
});
