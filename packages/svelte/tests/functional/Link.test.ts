import { createRouter } from "@real-router/core";
import { userEvent } from "@testing-library/user-event";
import { flushSync } from "svelte";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import Link from "../../src/components/Link.svelte";
import {
  createTestRouterWithADefaultRouter,
  renderWithRouter,
} from "../helpers";

import type { Router } from "@real-router/core";

describe("Link component", () => {
  let router: Router;

  beforeEach(async () => {
    router = createTestRouterWithADefaultRouter();
    await router.start("/");
  });

  afterEach(() => {
    router.stop();
  });

  it("should render an anchor with correct href", () => {
    renderWithRouter(router, Link, {
      routeName: "one-more-test",
    });

    const link = document.querySelector("a")!;

    expect(link).toBeInTheDocument();
    expect(link.getAttribute("href")).toBe("/test");
  });

  it("should render component with passed class name", () => {
    renderWithRouter(router, Link, {
      routeName: "one-more-test",
      class: "test-class",
    });

    const link = document.querySelector("a");

    expect(link!.classList.contains("test-class")).toBe(true);
  });

  describe("activeClassName", () => {
    it("should set active class when route matches", async () => {
      renderWithRouter(router, Link, {
        routeName: "one-more-test",
        activeClassName: "active",
      });

      const link = document.querySelector("a")!;

      expect(link.classList.contains("active")).toBe(false);

      await userEvent.click(link);
      flushSync();

      expect(link.classList.contains("active")).toBe(true);
    });

    it("should apply default 'active' class when no activeClassName prop is provided", async () => {
      renderWithRouter(router, Link, {
        routeName: "one-more-test",
      });

      const link = document.querySelector("a")!;

      expect(link.classList.contains("active")).toBe(false);

      await userEvent.click(link);
      flushSync();

      expect(link.classList.contains("active")).toBe(true);
    });

    it("should add active class based on activeStrict", async () => {
      await router.navigate("items.item", { id: 6 });

      renderWithRouter(router, Link, {
        routeName: "items",
        activeStrict: false,
        activeClassName: "active",
      });

      expect(document.querySelector("a")!.classList.contains("active")).toBe(
        true,
      );
    });
  });

  describe("clickHandler", () => {
    it("should not navigate when target is _blank", async () => {
      vi.spyOn(router, "navigate");

      renderWithRouter(router, Link, {
        routeName: "one-more-test",
        target: "_blank",
      });

      await userEvent.click(document.querySelector("a")!);

      expect(router.navigate).not.toHaveBeenCalled();
    });

    it("should not navigate when custom onclick calls preventDefault", () => {
      vi.spyOn(router, "navigate");

      renderWithRouter(router, Link, {
        routeName: "one-more-test",
        onclick: (evt: MouseEvent) => {
          evt.preventDefault();
        },
      });

      const link = document.querySelector("a")!;
      const event = new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
      });

      link.dispatchEvent(event);

      expect(router.navigate).not.toHaveBeenCalled();
    });

    it("should navigate when custom onclick does not prevent default", () => {
      vi.spyOn(router, "navigate").mockResolvedValue({} as never);

      renderWithRouter(router, Link, {
        routeName: "one-more-test",
        onclick: () => {},
      });

      const link = document.querySelector("a")!;
      const event = new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
      });

      link.dispatchEvent(event);

      expect(router.navigate).toHaveBeenCalledWith("one-more-test", {}, {});
    });
  });

  describe("URL Building", () => {
    it("should use buildPath when router has no buildUrl", async () => {
      const routerWithoutBuildUrl = createRouter([
        { name: "test", path: "/" },
        { name: "users", path: "/users" },
      ]);

      await routerWithoutBuildUrl.start("/");

      renderWithRouter(routerWithoutBuildUrl, Link, {
        routeName: "users",
      });

      expect(document.querySelector("a")!.getAttribute("href")).toBe("/users");

      routerWithoutBuildUrl.stop();
    });
  });

  it("should render without href and log error for invalid routeName", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    renderWithRouter(router, Link, { routeName: "@@nonexistent-route" });

    const link = document.querySelector("a")!;

    expect(link).toBeInTheDocument();
    expect(link.hasAttribute("href")).toBe(false);
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining("@@nonexistent-route"),
    );

    consoleError.mockRestore();
  });
});
