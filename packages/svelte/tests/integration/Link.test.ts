import { userEvent } from "@testing-library/user-event";
import { flushSync } from "svelte";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

import Link from "../../src/components/Link.svelte";
import {
  createTestRouterWithADefaultRouter,
  renderWithRouter,
} from "../helpers";

import type { Router } from "@real-router/core";

describe("Link - Integration Tests", () => {
  let router: Router;

  beforeEach(async () => {
    router = createTestRouterWithADefaultRouter();
    await router.start("/");
  });

  afterEach(() => {
    router.stop();
  });

  describe("Complex Navigation Scenarios", () => {
    it("should handle sequential navigation", async () => {
      renderWithRouter(router, Link, {
        routeName: "one-more-test",
      });

      const link = document.querySelector("a")!;

      await userEvent.click(link);
      flushSync();

      expect(router.getState()?.name).toBe("one-more-test");
    });
  });

  describe("ActiveClassName Edge Cases", () => {
    it("should correctly toggle active class on route changes", async () => {
      await router.navigate("one-more-test");

      renderWithRouter(router, Link, {
        routeName: "one-more-test",
        activeClassName: "active",
      });

      const link = document.querySelector("a")!;

      expect(link.classList.contains("active")).toBe(true);
    });

    it("should handle multiple classes correctly", async () => {
      await router.navigate("one-more-test");

      renderWithRouter(router, Link, {
        routeName: "one-more-test",
        class: "class1 class2",
        activeClassName: "active1 active2",
      });

      const link = document.querySelector("a")!;

      expect(link.classList.contains("class1")).toBe(true);
      expect(link.classList.contains("class2")).toBe(true);
      expect(link.classList.contains("active1")).toBe(true);
      expect(link.classList.contains("active2")).toBe(true);
    });
  });

  describe("Edge Cases with Events", () => {
    it("should prevent navigation with modifier keys", () => {
      vi.spyOn(router, "navigate");

      renderWithRouter(router, Link, {
        routeName: "one-more-test",
      });

      const link = document.querySelector("a")!;

      const event = new MouseEvent("click", { bubbles: true, shiftKey: true });

      link.dispatchEvent(event);

      expect(router.navigate).not.toHaveBeenCalled();
    });
  });

  describe("Browser Plugin Integration", () => {
    it("should use buildUrl when available", () => {
      const buildUrlSpy = vi.fn(() => "/custom-url");

      router.buildUrl = buildUrlSpy;

      renderWithRouter(router, Link, {
        routeName: "one-more-test",
      });

      expect(buildUrlSpy).toHaveBeenCalledWith("one-more-test", {});
      expect(document.querySelector("a")!.getAttribute("href")).toBe(
        "/custom-url",
      );
    });

    it("should generate correct href with query params", () => {
      renderWithRouter(router, Link, {
        routeName: "one-more-test",
        routeParams: { id: "123", filter: "active" },
      });

      const href = document.querySelector("a")!.getAttribute("href")!;

      expect(href).toContain("id=123");
      expect(href).toContain("filter=active");
    });
  });
});
