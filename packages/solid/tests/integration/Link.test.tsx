import { getLifecycleApi } from "@real-router/core/api";
import { render, screen } from "@solidjs/testing-library";
import { fireEvent } from "@testing-library/dom";
import { userEvent } from "@testing-library/user-event";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { Link, RouterProvider } from "@real-router/solid";

import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router } from "@real-router/core";
import type { JSX } from "solid-js";

describe("Link - Integration Tests", () => {
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

  describe("Complex Navigation Scenarios", () => {
    it("should handle navigation interruption correctly", async () => {
      render(
        () => (
          <>
            <Link routeName="one-more-test" data-testid="link1">
              Link 1
            </Link>
            <Link routeName="users" data-testid="link2">
              Link 2
            </Link>
          </>
        ),
        { wrapper },
      );

      await user.click(screen.getByTestId("link1"));

      expect(router.getState()?.name).toBe("one-more-test");

      await user.click(screen.getByTestId("link2"));

      expect(router.getState()?.name).toBe("users");
    });

    it("should handle multiple rapid clicks correctly", async () => {
      render(
        () => (
          <Link routeName="one-more-test" data-testid="link">
            Test Link
          </Link>
        ),
        { wrapper },
      );

      const link = screen.getByTestId("link");

      for (let i = 0; i < 10; i++) {
        await user.click(link);
      }

      expect(router.getState()?.name).toBe("one-more-test");
    });

    it("should recover from navigation error", async () => {
      let shouldFail = true;

      getLifecycleApi(router).addActivateGuard("one-more-test", () => () => {
        if (shouldFail) {
          return Promise.reject(new Error("Navigation blocked"));
        }

        return true;
      });

      render(
        () => (
          <Link routeName="one-more-test" data-testid="link">
            Test Link
          </Link>
        ),
        { wrapper },
      );

      await user.click(screen.getByTestId("link"));

      expect(router.getState()?.name).not.toBe("one-more-test");

      shouldFail = false;
      await user.click(screen.getByTestId("link"));

      expect(router.getState()?.name).toBe("one-more-test");
    });
  });

  describe("Edge Cases with Events", () => {
    it("should prevent navigation with multiple modifiers", () => {
      render(
        () => (
          <Link routeName="one-more-test" data-testid="link">
            Test Link
          </Link>
        ),
        { wrapper },
      );

      const link = screen.getByTestId("link");

      fireEvent.click(link, { shiftKey: true, ctrlKey: true });

      expect(router.getState()?.name).not.toBe("one-more-test");

      fireEvent.click(link, { altKey: true, metaKey: true });

      expect(router.getState()?.name).not.toBe("one-more-test");
    });

    it("should still call onClick with modifier keys", () => {
      const onClickSpy = vi.fn();

      render(
        () => (
          <Link
            routeName="one-more-test"
            onClick={onClickSpy}
            data-testid="link"
          >
            Test Link
          </Link>
        ),
        { wrapper },
      );

      fireEvent.click(screen.getByTestId("link"), { shiftKey: true });

      expect(onClickSpy).toHaveBeenCalled();
    });
  });

  describe("ActiveClassName Edge Cases", () => {
    it("should handle empty activeClassName", async () => {
      await router.navigate("one-more-test");

      render(
        () => (
          <Link
            routeName="one-more-test"
            activeClassName=""
            class="base-class"
            data-testid="link"
          >
            Test
          </Link>
        ),
        { wrapper },
      );

      const link = screen.getByTestId("link");

      expect(link).toHaveClass("base-class");
      expect(link.className).toBe("base-class");
    });

    it("should handle multiple classes correctly", async () => {
      await router.navigate("one-more-test");

      render(
        () => (
          <Link
            routeName="one-more-test"
            class="class1 class2"
            activeClassName="active1 active2"
            data-testid="link"
          >
            Test
          </Link>
        ),
        { wrapper },
      );

      const link = screen.getByTestId("link");

      expect(link).toHaveClass("class1", "class2", "active1", "active2");
    });

    it("should correctly toggle active class on route changes", async () => {
      render(
        () => (
          <>
            <Link
              routeName="one-more-test"
              activeClassName="active"
              data-testid="link1"
            >
              Link 1
            </Link>
            <Link
              routeName="users"
              activeClassName="active"
              data-testid="link2"
            >
              Link 2
            </Link>
          </>
        ),
        { wrapper },
      );

      await user.click(screen.getByTestId("link1"));

      expect(screen.getByTestId("link1")).toHaveClass("active");
      expect(screen.getByTestId("link2")).not.toHaveClass("active");

      await user.click(screen.getByTestId("link2"));

      expect(screen.getByTestId("link2")).toHaveClass("active");
      expect(screen.getByTestId("link1")).not.toHaveClass("active");
    });
  });

  describe("Accessibility and Semantics", () => {
    it("should preserve all passed props", () => {
      render(
        () => (
          <Link
            routeName="one-more-test"
            aria-label="Test link"
            role="link"
            tabIndex={0}
            data-testid="link"
          >
            Test
          </Link>
        ),
        { wrapper },
      );

      const link = screen.getByTestId("link");

      expect(link).toHaveAttribute("aria-label", "Test link");
      expect(link).toHaveAttribute("role", "link");
      expect(link).toHaveAttribute("tabIndex", "0");
    });
  });

  describe("Browser Plugin Integration", () => {
    it("should use buildUrl when available", () => {
      const buildUrlSpy = vi.fn(() => "/custom-url");

      router.buildUrl = buildUrlSpy;

      render(
        () => (
          <Link routeName="one-more-test" data-testid="link">
            Test
          </Link>
        ),
        { wrapper },
      );

      expect(buildUrlSpy).toHaveBeenCalledWith(
        "one-more-test",
        {},
        undefined,
        undefined,
      );
      expect(screen.getByTestId("link")).toHaveAttribute("href", "/custom-url");
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

      render(
        () => (
          <Link routeName="one-more-test" hash="anchor" data-testid="link">
            Test
          </Link>
        ),
        { wrapper },
      );

      expect(buildUrlSpy).toHaveBeenCalledWith("one-more-test", {}, undefined, {
        hash: "anchor",
      });
      expect(screen.getByTestId("link")).toHaveAttribute("href", "/url#anchor");
    });

    it("should generate correct href with query params", () => {
      render(
        () => (
          <Link
            routeName="one-more-test"
            routeParams={{ id: "123", filter: "active" }}
            data-testid="link"
          >
            Test
          </Link>
        ),
        { wrapper },
      );

      const href = screen.getByTestId("link").getAttribute("href");

      expect(href).toContain("id=123");
      expect(href).toContain("filter=active");
    });
  });

  describe("State Management Integration", () => {
    it("should respond to router state changes", async () => {
      render(
        () => (
          <Link
            routeName="one-more-test"
            activeClassName="active"
            data-testid="link"
          >
            Test
          </Link>
        ),
        { wrapper },
      );

      expect(screen.getByTestId("link")).not.toHaveClass("active");

      await router.navigate("one-more-test");

      expect(screen.getByTestId("link")).toHaveClass("active");
    });
  });

  // Sprint C.3 — UI-level lock for the empty-routeName sentinel
  // (audit-4 LOW recommendation #2 + CLAUDE.md Gotcha #16). PBT in
  // routerProvider.properties.ts already lock the `isRouteActive("","")`
  // helper answer; this integration test exercises the full Link →
  // RouterProvider → routeSelector pipeline so a regression in any
  // layer (selector wrapping, sentinel value change, Link-side
  // short-circuit) becomes visible at the UI boundary.
  describe("Empty routeName is inactive in every router state (#1427)", () => {
    // An empty routeName is a misuse (matches no route). Before #1427 the Link
    // fast path went through the routeSelector, whose unstarted sentinel
    // (`route?.name ?? ""`) made `isRouteActive("", "") === true` — the Link lit
    // up before `router.start()`. The `routeName !== ""` guard in `useFastPath`
    // now routes an empty name to the slow `createActiveRouteSource`, so the Link
    // tracks the canonical `router.isActiveRoute("") === false` in EVERY state.
    it("Link routeName='' is INACTIVE before router.start()", () => {
      // Stop the router so it has no active route (the sentinel state).
      router.stop();

      render(
        () => (
          <Link routeName="" activeClassName="active" data-testid="empty-link">
            Home
          </Link>
        ),
        { wrapper },
      );

      expect(screen.getByTestId("empty-link")).not.toHaveClass("active");
    });

    it("Link routeName='' stays INACTIVE after router commits a real route", async () => {
      router.stop();

      render(
        () => (
          <Link routeName="" activeClassName="active" data-testid="empty-link">
            Home
          </Link>
        ),
        { wrapper },
      );

      // Inactive before start (aligned with isActiveRoute("") === false)…
      expect(screen.getByTestId("empty-link")).not.toHaveClass("active");

      await router.start("/");

      // …and still inactive once a real route resolves.
      expect(screen.getByTestId("empty-link")).not.toHaveClass("active");
    });
  });
});
