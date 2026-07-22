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

      expect(buildUrlSpy).toHaveBeenCalledWith(
        "one-more-test",
        {},
        undefined,
        undefined,
      );
      expect(document.querySelector("a")!.getAttribute("href")).toBe(
        "/custom-url",
      );
    });

    it("should pass hash option to buildUrl when hash prop is set (#532)", () => {
      const buildUrlSpy = vi.fn(
        (
          _name: string,
          _params?: object,
          _search?: object,
          opts?: { hash?: string },
        ): string => (opts?.hash ? `/url#${opts.hash}` : "/url"),
      );

      router.buildUrl = buildUrlSpy;

      renderWithRouter(router, Link, {
        routeName: "one-more-test",
        hash: "anchor",
      });

      expect(buildUrlSpy).toHaveBeenCalledWith("one-more-test", {}, undefined, {
        hash: "anchor",
      });
      expect(document.querySelector("a")!.getAttribute("href")).toBe(
        "/url#anchor",
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

  // Locks gotcha #16 / CLAUDE.md `<Link hash>` Prop (#532) tri-state contract:
  // - undefined (omitted) → preserve current state.context.url.hash on click
  //   (no `hash` key forwarded to navigate so plugins see "no hash intent")
  // - "" (explicit empty) → clear the fragment on click
  // - "value" → set the fragment (and trigger force/hashChange auto-bypass
  //   when same route+params, different hash — see navigateWithHash tests)
  describe("Hash Tri-State Contract (#532)", () => {
    it("hash=undefined → click forwards opts without `hash` key (preserve current)", async () => {
      const navigateSpy = vi.spyOn(router, "navigate");

      renderWithRouter(router, Link, {
        routeName: "one-more-test",
      });

      const link = document.querySelector("a")!;

      await userEvent.click(link);

      expect(navigateSpy).toHaveBeenCalledTimes(1);

      const opts = navigateSpy.mock.calls[0][3] as
        { hash?: string } | undefined;

      // Critical: the `hash` key must be ABSENT (not `undefined`) so plugins
      // can distinguish "no hash intent" from "explicit clear".
      expect(opts).toBeDefined();
      expect(Object.prototype.hasOwnProperty.call(opts, "hash")).toBe(false);
    });

    it("hash='' → click forwards `opts.hash = \"\"` (explicit clear)", async () => {
      const navigateSpy = vi.spyOn(router, "navigate");

      renderWithRouter(router, Link, {
        routeName: "one-more-test",
        hash: "",
      });

      const link = document.querySelector("a")!;

      await userEvent.click(link);

      expect(navigateSpy).toHaveBeenCalledTimes(1);

      const opts = navigateSpy.mock.calls[0][3] as { hash?: string };

      // Explicit empty hash: present in opts with empty-string value.
      expect(Object.prototype.hasOwnProperty.call(opts, "hash")).toBe(true);
      expect(opts.hash).toBe("");
    });

    it("hash='value' → click forwards `opts.hash = \"value\"` (set)", async () => {
      const navigateSpy = vi.spyOn(router, "navigate");

      renderWithRouter(router, Link, {
        routeName: "one-more-test",
        hash: "section",
      });

      const link = document.querySelector("a")!;

      await userEvent.click(link);

      expect(navigateSpy).toHaveBeenCalledTimes(1);

      const opts = navigateSpy.mock.calls[0][3] as { hash?: string };

      expect(opts.hash).toBe("section");
    });

    it("hash='value' on same route + same params → auto-adds force + hashChange", async () => {
      // Navigate to the target so the link is "same route + same params"
      // when clicked. Without force/hashChange, core's SAME_STATES check
      // would correctly reject the hash-only navigation — the link would
      // silently no-op. The auto-bypass is the #532 UX feature.
      await router.navigate("one-more-test");

      const navigateSpy = vi.spyOn(router, "navigate");

      renderWithRouter(router, Link, {
        routeName: "one-more-test",
        hash: "tab-2",
      });

      const link = document.querySelector("a")!;

      await userEvent.click(link);

      expect(navigateSpy).toHaveBeenCalledTimes(1);

      const opts = navigateSpy.mock.calls[0][3] as {
        force?: boolean;
        hashChange?: boolean;
        hash?: string;
      };

      expect(opts.hash).toBe("tab-2");
      expect(opts.force).toBe(true);
      expect(opts.hashChange).toBe(true);
    });
  });
});
