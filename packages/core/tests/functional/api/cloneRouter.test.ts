import { describe, it, expect } from "vitest";

import {
  cloneRouter,
  createRouter,
  getDependenciesApi,
} from "@real-router/core";

import { createTestRouter } from "../../helpers";

interface TestDeps {
  token?: string;
}

describe("cloneRouter()", () => {
  it("should return a new Router instance", () => {
    const router = createTestRouter();
    const clone = cloneRouter(router);

    expect(clone).not.toBe(router);
  });

  it("should share the route tree with original", () => {
    const router = createTestRouter();
    const clone = cloneRouter(router);

    expect(router.buildPath("home")).toBe(clone.buildPath("home"));
  });

  it("should accept custom dependencies and make them accessible", () => {
    const router = createRouter<TestDeps>(
      [{ name: "home", path: "/home" }],
      {},
      { token: "original" },
    );
    const clone = cloneRouter(router, { token: "cloned" });
    const deps = getDependenciesApi(clone);

    expect(deps.get("token")).toBe("cloned");
  });

  it("should work without dependencies argument", () => {
    const router = createTestRouter();
    const clone = cloneRouter(router);

    expect(clone.hasRoute("home")).toBe(true);
  });
});
