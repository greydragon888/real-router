import { createRouter } from "@real-router/core";
import { describe, it, expect } from "vitest";

import { buildHref, shallowEqual, shouldNavigate } from "../../src/dom-utils";

describe("dom-utils integration (copy from shared/)", () => {
  it("buildHref returns correct path after prebundle copy", async () => {
    const router = createRouter([
      { name: "home", path: "/" },
      { name: "users", path: "/users" },
    ]);

    await router.start("/");

    expect(buildHref(router, "home", {})).toBe("/");

    router.stop();
  });

  it("shouldNavigate rejects modified clicks", () => {
    const event = {
      button: 0,
      metaKey: true,
      altKey: false,
      ctrlKey: false,
      shiftKey: false,
    } as MouseEvent;

    expect(shouldNavigate(event)).toBe(false);
  });

  it("shouldNavigate accepts clean left-click", () => {
    const event = {
      button: 0,
      metaKey: false,
      altKey: false,
      ctrlKey: false,
      shiftKey: false,
    } as MouseEvent;

    expect(shouldNavigate(event)).toBe(true);
  });

  it("shallowEqual: identical reference, both undefined, and mismatched key sets", () => {
    const ref = { id: "1" };

    expect(shallowEqual(ref, ref)).toBe(true);
    expect(shallowEqual(undefined, undefined)).toBe(true);
    expect(shallowEqual(undefined, { id: "1" })).toBe(false);
    expect(shallowEqual({ id: "1" }, undefined)).toBe(false);
    expect(shallowEqual({ id: "1" }, { id: "1", extra: "x" })).toBe(false);
  });

  it("shallowEqual: per-key Object.is comparison is order-insensitive", () => {
    expect(shallowEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
    expect(shallowEqual({ id: "1" }, { id: "2" })).toBe(false);
    expect(shallowEqual({ id: 1n }, { id: 1n })).toBe(true);
  });
});
