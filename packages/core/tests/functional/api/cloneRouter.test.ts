import { describe, it, expect } from "vitest";

import { cloneRouter } from "@real-router/core";

import { createTestRouter } from "../../helpers";

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

  it("should accept custom dependencies", () => {
    const router = createTestRouter();
    const clone = cloneRouter(router, { customDep: "value" } as never);

    expect(clone).toBeDefined();
  });

  it("should work without dependencies argument", () => {
    const router = createTestRouter();
    const clone = cloneRouter(router);

    expect(clone.hasRoute("home")).toBe(true);
  });
});
