import { describe, it, expect, vi } from "vitest";

import {
  shouldNavigate,
  buildHref,
  buildActiveClassName,
  applyLinkA11y,
} from "../../src";

import type { Router } from "@real-router/core";

describe("shouldNavigate", () => {
  it("1 — returns true for left click with no modifiers", () => {
    const evt = new MouseEvent("click", { button: 0, bubbles: true });

    expect(shouldNavigate(evt)).toBe(true);
  });

  it("2 — returns false when metaKey is pressed", () => {
    const evt = new MouseEvent("click", {
      button: 0,
      metaKey: true,
      bubbles: true,
    });

    expect(shouldNavigate(evt)).toBe(false);
  });

  it("3 — returns false when altKey is pressed", () => {
    const evt = new MouseEvent("click", {
      button: 0,
      altKey: true,
      bubbles: true,
    });

    expect(shouldNavigate(evt)).toBe(false);
  });

  it("4 — returns false when ctrlKey is pressed", () => {
    const evt = new MouseEvent("click", {
      button: 0,
      ctrlKey: true,
      bubbles: true,
    });

    expect(shouldNavigate(evt)).toBe(false);
  });

  it("5 — returns false when shiftKey is pressed", () => {
    const evt = new MouseEvent("click", {
      button: 0,
      shiftKey: true,
      bubbles: true,
    });

    expect(shouldNavigate(evt)).toBe(false);
  });

  it("6 — returns false for middle click (button === 1)", () => {
    const evt = new MouseEvent("click", { button: 1, bubbles: true });

    expect(shouldNavigate(evt)).toBe(false);
  });

  it("7 — returns false for right click (button === 2)", () => {
    const evt = new MouseEvent("click", { button: 2, bubbles: true });

    expect(shouldNavigate(evt)).toBe(false);
  });
});

describe("buildHref", () => {
  it("1 — uses buildUrl when available", () => {
    const router = {
      buildUrl: vi.fn().mockReturnValue("/url/123"),
      buildPath: vi.fn().mockReturnValue("/path/123"),
    } as unknown as Router;

    const result = buildHref(router, "users.profile", { id: "123" });

    expect(result).toBe("/url/123");
    expect(router.buildUrl).toHaveBeenCalledWith("users.profile", {
      id: "123",
    });
    expect(router.buildPath).not.toHaveBeenCalled();
  });

  it("2 — falls back to buildPath when buildUrl is not a function", () => {
    const router = {
      buildPath: vi.fn().mockReturnValue("/path/123"),
    } as unknown as Router;

    const result = buildHref(router, "users.profile", { id: "123" });

    expect(result).toBe("/path/123");
    expect(router.buildPath).toHaveBeenCalledWith("users.profile", {
      id: "123",
    });
  });

  it("3 — passes empty params to buildUrl", () => {
    const router = {
      buildUrl: vi.fn().mockReturnValue("/home"),
      buildPath: vi.fn(),
    } as unknown as Router;

    buildHref(router, "home", {});

    expect(router.buildUrl).toHaveBeenCalledWith("home", {});
  });

  it("4 — passes empty params to buildPath fallback", () => {
    const router = {
      buildPath: vi.fn().mockReturnValue("/home"),
    } as unknown as Router;

    buildHref(router, "home", {});

    expect(router.buildPath).toHaveBeenCalledWith("home", {});
  });
});

describe("buildActiveClassName", () => {
  it("1 — returns activeClassName alone when active and no base class", () => {
    expect(buildActiveClassName(true, "active", undefined)).toBe("active");
  });

  it("2 — concatenates base class and activeClassName when active and both provided", () => {
    expect(buildActiveClassName(true, "active", "nav-link")).toBe(
      "nav-link active",
    );
  });

  it("3 — returns base class when not active", () => {
    expect(buildActiveClassName(false, "active", "nav-link")).toBe("nav-link");
  });

  it("4 — returns undefined when not active and no base class", () => {
    expect(buildActiveClassName(false, "active", undefined)).toBeUndefined();
  });

  it("5 — returns base class when active but no activeClassName provided", () => {
    expect(buildActiveClassName(true, undefined, "nav-link")).toBe("nav-link");
  });

  it("6 — returns undefined when not active and no classes at all", () => {
    expect(buildActiveClassName(false, undefined, undefined)).toBeUndefined();
  });

  it("7 — returns base class when active but activeClassName is empty string", () => {
    expect(buildActiveClassName(true, "", "nav-link")).toBe("nav-link");
  });
});

describe("applyLinkA11y", () => {
  it("1 — sets role='link' and tabindex='0' on a generic element (div)", () => {
    const div = document.createElement("div");

    applyLinkA11y(div);

    expect(div.getAttribute("role")).toBe("link");
    expect(div.getAttribute("tabindex")).toBe("0");
  });

  it("2 — skips anchor elements — does not set role or tabindex", () => {
    const a = document.createElement("a");

    applyLinkA11y(a);

    expect(a.getAttribute("role")).toBeNull();
    expect(a.getAttribute("tabindex")).toBeNull();
  });

  it("3 — skips button elements — does not set role or tabindex", () => {
    const button = document.createElement("button");

    applyLinkA11y(button);

    expect(button.getAttribute("role")).toBeNull();
    expect(button.getAttribute("tabindex")).toBeNull();
  });

  it("4 — preserves existing role when one is already set", () => {
    const div = document.createElement("div");

    div.setAttribute("role", "navigation");

    applyLinkA11y(div);

    expect(div.getAttribute("role")).toBe("navigation");
    expect(div.getAttribute("tabindex")).toBe("0");
  });

  it("5 — preserves existing tabindex when one is already set", () => {
    const div = document.createElement("div");

    div.setAttribute("tabindex", "-1");

    applyLinkA11y(div);

    expect(div.getAttribute("role")).toBe("link");
    expect(div.getAttribute("tabindex")).toBe("-1");
  });

  it("6 — sets role and tabindex on a span element", () => {
    const span = document.createElement("span");

    applyLinkA11y(span);

    expect(span.getAttribute("role")).toBe("link");
    expect(span.getAttribute("tabindex")).toBe("0");
  });
});
