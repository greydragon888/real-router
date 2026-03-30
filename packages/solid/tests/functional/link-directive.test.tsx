import { render, screen } from "@solidjs/testing-library";
import { fireEvent } from "@testing-library/dom";
import { userEvent } from "@testing-library/user-event";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

// @ts-expect-error - link is used in JSX directives
// eslint-disable-next-line @typescript-eslint/no-unused-vars, sonarjs/unused-import
import { RouterProvider, link } from "@real-router/solid";

import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router } from "@real-router/core";
import type { JSX } from "solid-js";

describe("link directive", () => {
  let router: Router;
  const user = userEvent.setup();

  const wrapper = (props: { children: JSX.Element }) => (
    <RouterProvider router={router}>{props.children}</RouterProvider>
  );

  beforeEach(async () => {
    router = createTestRouterWithADefaultRouter();
    await router.start("/");
  });

  afterEach(() => {
    router.stop();
  });

  describe("href attribute", () => {
    it("should set href on <a> elements", () => {
      render(
        () => (
          <a use:link={{ routeName: "one-more-test" }} data-testid="link">
            Test
          </a>
        ),
        { wrapper },
      );

      expect(screen.getByTestId("link")).toHaveAttribute("href", "/test");
    });

    it("should set href with route params", () => {
      render(
        () => (
          <a
            use:link={{
              routeName: "items.item",
              routeParams: { id: "123" },
            }}
            data-testid="link"
          >
            Test
          </a>
        ),
        { wrapper },
      );

      expect(screen.getByTestId("link")).toHaveAttribute("href", "/items/123");
    });

    it("should not set href and log error for invalid routeName", () => {
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      render(
        () => (
          <a use:link={{ routeName: "@@nonexistent-route" }} data-testid="link">
            Test
          </a>
        ),
        { wrapper },
      );

      expect(screen.getByTestId("link")).not.toHaveAttribute("href");
      expect(consoleError).toHaveBeenCalledWith(
        expect.stringContaining("@@nonexistent-route"),
      );

      consoleError.mockRestore();
    });
  });

  describe("a11y attributes", () => {
    it("should add role and tabindex to non-focusable elements", () => {
      render(
        () => (
          <div use:link={{ routeName: "one-more-test" }} data-testid="link">
            Test
          </div>
        ),
        { wrapper },
      );

      const element = screen.getByTestId("link");

      expect(element).toHaveAttribute("role", "link");
      expect(element).toHaveAttribute("tabindex", "0");
    });

    it("should not override existing role attribute", () => {
      render(
        () => (
          <div
            use:link={{ routeName: "one-more-test" }}
            role="button"
            data-testid="link"
          >
            Test
          </div>
        ),
        { wrapper },
      );

      expect(screen.getByTestId("link")).toHaveAttribute("role", "button");
    });

    it("should not override existing tabindex attribute", () => {
      render(
        () => (
          <div
            use:link={{ routeName: "one-more-test" }}
            tabindex={-1}
            data-testid="link"
          >
            Test
          </div>
        ),
        { wrapper },
      );

      expect(screen.getByTestId("link")).toHaveAttribute("tabindex", "-1");
    });

    it("should not add a11y attributes to <a> elements", () => {
      render(
        () => (
          <a use:link={{ routeName: "one-more-test" }} data-testid="link">
            Test
          </a>
        ),
        { wrapper },
      );

      const element = screen.getByTestId("link");

      expect(element).not.toHaveAttribute("role");
    });

    it("should not add a11y attributes to <button> elements", () => {
      render(
        () => (
          <button use:link={{ routeName: "one-more-test" }} data-testid="link">
            Test
          </button>
        ),
        { wrapper },
      );

      const element = screen.getByTestId("link");

      expect(element).not.toHaveAttribute("role");
    });
  });

  describe("click handler", () => {
    it("should navigate on left click", async () => {
      render(
        () => (
          <a use:link={{ routeName: "one-more-test" }} data-testid="link">
            Test
          </a>
        ),
        { wrapper },
      );

      expect(router.getState()?.name).not.toBe("one-more-test");

      await user.click(screen.getByTestId("link"));

      expect(router.getState()?.name).toBe("one-more-test");
    });

    it("should navigate with route params", async () => {
      render(
        () => (
          <a
            use:link={{
              routeName: "items.item",
              routeParams: { id: "456" },
            }}
            data-testid="link"
          >
            Test
          </a>
        ),
        { wrapper },
      );

      await user.click(screen.getByTestId("link"));

      expect(router.getState()?.name).toStrictEqual("items.item");
      expect(router.getState()?.params).toStrictEqual({ id: "456" });
    });

    it("should not navigate on right click", () => {
      vi.spyOn(router, "navigate");

      render(
        () => (
          <a use:link={{ routeName: "one-more-test" }} data-testid="link">
            Test
          </a>
        ),
        { wrapper },
      );

      fireEvent.click(screen.getByTestId("link"), { button: 1 });

      expect(router.navigate).not.toHaveBeenCalled();
    });

    it("should not navigate with modifier keys", () => {
      vi.spyOn(router, "navigate");

      render(
        () => (
          <a use:link={{ routeName: "one-more-test" }} data-testid="link">
            Test
          </a>
        ),
        { wrapper },
      );

      fireEvent.click(screen.getByTestId("link"), { ctrlKey: true });

      expect(router.navigate).not.toHaveBeenCalled();
    });

    it("should prevent default on <a> elements", async () => {
      const preventDefaultSpy = vi.spyOn(Event.prototype, "preventDefault");

      render(
        () => (
          <a use:link={{ routeName: "one-more-test" }} data-testid="link">
            Test
          </a>
        ),
        { wrapper },
      );

      await user.click(screen.getByTestId("link"));

      expect(preventDefaultSpy).toHaveBeenCalled();

      preventDefaultSpy.mockRestore();
    });

    it("should not prevent default on non-<a> elements", async () => {
      const preventDefaultSpy = vi.spyOn(Event.prototype, "preventDefault");

      render(
        () => (
          <div use:link={{ routeName: "one-more-test" }} data-testid="link">
            Test
          </div>
        ),
        { wrapper },
      );

      await user.click(screen.getByTestId("link"));

      expect(preventDefaultSpy).not.toHaveBeenCalled();

      preventDefaultSpy.mockRestore();
    });
  });

  describe("keyboard handler", () => {
    it("should not navigate on other keys", () => {
      vi.spyOn(router, "navigate");

      render(
        () => (
          <div use:link={{ routeName: "one-more-test" }} data-testid="link">
            Test
          </div>
        ),
        { wrapper },
      );

      fireEvent.keyDown(screen.getByTestId("link"), { key: "Space" });

      expect(router.navigate).not.toHaveBeenCalled();
    });
  });

  describe("active class", () => {
    it("should add active class when route matches", async () => {
      render(
        () => (
          <a
            use:link={{
              routeName: "one-more-test",
              activeClassName: "active",
            }}
            data-testid="link"
          >
            Test
          </a>
        ),
        { wrapper },
      );

      expect(screen.getByTestId("link")).not.toHaveClass("active");

      await user.click(screen.getByTestId("link"));

      expect(screen.getByTestId("link")).toHaveClass("active");
    });

    it("should remove active class when route changes", async () => {
      await router.navigate("one-more-test");

      render(
        () => (
          <a
            use:link={{
              routeName: "one-more-test",
              activeClassName: "active",
            }}
            data-testid="link"
          >
            Test
          </a>
        ),
        { wrapper },
      );

      expect(screen.getByTestId("link")).toHaveClass("active");

      await router.navigate("home");

      expect(screen.getByTestId("link")).not.toHaveClass("active");
    });

    it("should respect activeStrict option", async () => {
      await router.navigate("items.item", { id: "123" });

      render(
        () => (
          <a
            use:link={{
              routeName: "items",
              activeClassName: "active",
              activeStrict: false,
            }}
            data-testid="link"
          >
            Test
          </a>
        ),
        { wrapper },
      );

      expect(screen.getByTestId("link")).toHaveClass("active");
    });

    it("should not add active class with activeStrict when child route is active", async () => {
      await router.navigate("items.item", { id: "123" });

      render(
        () => (
          <a
            use:link={{
              routeName: "items",
              activeClassName: "active",
              activeStrict: true,
            }}
            data-testid="link"
          >
            Test
          </a>
        ),
        { wrapper },
      );

      expect(screen.getByTestId("link")).not.toHaveClass("active");
    });

    it("should respect ignoreQueryParams option", async () => {
      render(
        () => (
          <a
            use:link={{
              routeName: "items.item",
              routeParams: { id: "123" },
              activeClassName: "active",
              ignoreQueryParams: true,
            }}
            data-testid="link"
          >
            Test
          </a>
        ),
        { wrapper },
      );

      await router.navigate("items.item", { id: "123", page: "2" });

      expect(screen.getByTestId("link")).toHaveClass("active");
    });

    it("should not add active class when ignoreQueryParams is false and query differs", async () => {
      render(
        () => (
          <a
            use:link={{
              routeName: "items.item",
              routeParams: { id: "123" },
              activeClassName: "active",
              ignoreQueryParams: false,
            }}
            data-testid="link"
          >
            Test
          </a>
        ),
        { wrapper },
      );

      await router.navigate("items.item", { id: "123", page: "2" });

      expect(screen.getByTestId("link")).not.toHaveClass("active");
    });

    it("should not add active class when activeClassName is not provided", async () => {
      render(
        () => (
          <a use:link={{ routeName: "one-more-test" }} data-testid="link">
            Test
          </a>
        ),
        { wrapper },
      );

      await user.click(screen.getByTestId("link"));

      expect(screen.getByTestId("link")).not.toHaveClass("active");
    });
  });

  describe("route options", () => {
    it("should pass route options to navigate", async () => {
      const navigateSpy = vi.spyOn(router, "navigate");

      render(
        () => (
          <a
            use:link={{
              routeName: "one-more-test",
              routeOptions: { replace: true },
            }}
            data-testid="link"
          >
            Test
          </a>
        ),
        { wrapper },
      );

      await user.click(screen.getByTestId("link"));

      expect(navigateSpy).toHaveBeenCalledWith(
        "one-more-test",
        {},
        { replace: true },
      );
    });
  });

  describe("cleanup", () => {
    it("should remove event listeners on cleanup", () => {
      const { unmount } = render(
        () => (
          <a use:link={{ routeName: "one-more-test" }} data-testid="link">
            Test
          </a>
        ),
        { wrapper },
      );

      const linkElement = screen.getByTestId("link");
      const removeEventListenerSpy = vi.spyOn(
        linkElement,
        "removeEventListener",
      );

      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        "click",
        expect.any(Function),
      );
    });
  });
});
