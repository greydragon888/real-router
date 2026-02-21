import {
  screen,
  render,
  act,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { useState, useRef } from "react";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { BaseLink, RouterProvider } from "@real-router/react";

import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router, State } from "@real-router/core";
import type { ReactNode } from "react";

describe("BaseLink - Integration Tests", () => {
  let router: Router;
  const user = userEvent.setup();

  const wrapper = ({ children }: { children: ReactNode }) => (
    <RouterProvider router={router}>{children}</RouterProvider>
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
        <>
          <BaseLink
            router={router}
            routeName="one-more-test"
            data-testid="link1"
          >
            Link 1
          </BaseLink>
          <BaseLink router={router} routeName="users" data-testid="link2">
            Link 2
          </BaseLink>
        </>,
        { wrapper },
      );

      // Start first navigation
      await user.click(screen.getByTestId("link1"));

      await waitFor(() => {
        expect(router.getState()?.name).toBe("one-more-test");
      });

      // Start second navigation
      await user.click(screen.getByTestId("link2"));

      await waitFor(() => {
        expect(router.getState()?.name).toBe("users");
      });
    });

    it("should handle multiple rapid clicks correctly", async () => {
      render(
        <BaseLink router={router} routeName="one-more-test" data-testid="link">
          Test Link
        </BaseLink>,
        { wrapper },
      );

      const link = screen.getByTestId("link");

      // Rapid clicks
      for (let i = 0; i < 10; i++) {
        await user.click(link);
      }

      // Should navigate successfully without race conditions
      await waitFor(() => {
        expect(router.getState()?.name).toBe("one-more-test");
      });
    });

    it("should recover from navigation error", async () => {
      let shouldFail = true;

      router.addActivateGuard("one-more-test", () => () => {
        if (shouldFail) {
          return Promise.reject(new Error("Navigation blocked"));
        }

        return true;
      });

      render(
        <BaseLink router={router} routeName="one-more-test" data-testid="link">
          Test Link
        </BaseLink>,
        { wrapper },
      );

      // First click should fail (guard blocks it)
      await user.click(screen.getByTestId("link"));

      await waitFor(() => {
        expect(router.getState()?.name).not.toBe("one-more-test");
      });

      // Second click should succeed
      shouldFail = false;
      await user.click(screen.getByTestId("link"));

      await waitFor(() => {
        expect(router.getState()?.name).toBe("one-more-test");
      });
    });

    it("should handle sequential navigation to different routes", async () => {
      const routes = ["one-more-test", "users", "items"];
      const links = routes.map((route) => (
        <BaseLink
          key={route}
          router={router}
          routeName={route}
          data-testid={`link-${route}`}
        >
          {route}
        </BaseLink>
      ));

      render(<div>{links}</div>, { wrapper });

      // Navigate through all routes sequentially
      for (const route of routes) {
        await user.click(screen.getByTestId(`link-${route}`));
        await waitFor(() => {
          expect(router.getState()?.name).toBe(route);
        });
      }
    });

    it("should handle navigation with plugin side effects", async () => {
      const sideEffects: string[] = [];

      router.usePlugin(() => ({
        onTransitionSuccess: (toState: State) => {
          sideEffects.push(toState.name);
        },
      }));

      render(
        <BaseLink router={router} routeName="one-more-test" data-testid="link">
          Test
        </BaseLink>,
        { wrapper },
      );

      await user.click(screen.getByTestId("link"));

      await waitFor(() => {
        expect(router.getState()?.name).toBe("one-more-test");
        expect(sideEffects).toContain("one-more-test");
      });
    });
  });

  describe("Edge Cases with Events", () => {
    it("should prevent navigation with multiple modifiers", () => {
      render(
        <BaseLink router={router} routeName="one-more-test" data-testid="link">
          Test Link
        </BaseLink>,
        { wrapper },
      );

      const link = screen.getByTestId("link");

      // Shift + Ctrl click
      fireEvent.click(link, { shiftKey: true, ctrlKey: true });

      expect(router.getState()?.name).not.toBe("one-more-test");

      // Alt + Meta click
      fireEvent.click(link, { altKey: true, metaKey: true });

      expect(router.getState()?.name).not.toBe("one-more-test");
    });

    it("should still call onClick with modifier keys", () => {
      const onClickSpy = vi.fn();

      render(
        <BaseLink
          router={router}
          routeName="one-more-test"
          onClick={onClickSpy}
          data-testid="link"
        >
          Test Link
        </BaseLink>,
        { wrapper },
      );

      fireEvent.click(screen.getByTestId("link"), { shiftKey: true });

      expect(onClickSpy).toHaveBeenCalled();
    });

    it("should handle programmatic click via ref", async () => {
      const TestComponent = () => {
        const linkRef = useRef<HTMLAnchorElement>(null);

        return (
          <>
            <BaseLink
              ref={linkRef}
              router={router}
              routeName="one-more-test"
              data-testid="link"
            >
              Test Link
            </BaseLink>
            <button
              onClick={() => linkRef.current?.click()}
              data-testid="trigger"
            >
              Trigger Click
            </button>
          </>
        );
      };

      render(<TestComponent />, { wrapper });

      await user.click(screen.getByTestId("trigger"));

      await waitFor(() => {
        expect(router.getState()?.name).toBe("one-more-test");
      });
    });

    it("should handle disabled link attribute", () => {
      render(
        <BaseLink
          router={router}
          routeName="one-more-test"
          disabled={true}
          data-testid="link"
        >
          Test
        </BaseLink>,
        { wrapper },
      );

      const link = screen.getByTestId("link");

      expect(link).toHaveAttribute("disabled");
    });

    it("should handle keyboard navigation (Enter key)", async () => {
      render(
        <BaseLink router={router} routeName="one-more-test" data-testid="link">
          Test
        </BaseLink>,
        { wrapper },
      );

      const link = screen.getByTestId("link");

      link.focus();

      await user.keyboard("{Enter}");

      await waitFor(() => {
        expect(router.getState()?.name).toBe("one-more-test");
      });
    });
  });

  describe("ActiveClassName Edge Cases", () => {
    it("should handle empty activeClassName", async () => {
      await router.navigate("one-more-test");

      render(
        <BaseLink
          router={router}
          routeName="one-more-test"
          activeClassName=""
          className="base-class"
          data-testid="link"
        >
          Test
        </BaseLink>,
        { wrapper },
      );

      const link = screen.getByTestId("link");

      expect(link).toHaveClass("base-class");
      expect(link.className).toBe("base-class");
    });

    it("should handle multiple classes correctly", async () => {
      await router.navigate("one-more-test");

      render(
        <BaseLink
          router={router}
          routeName="one-more-test"
          className="class1 class2"
          activeClassName="active1 active2"
          data-testid="link"
        >
          Test
        </BaseLink>,
        { wrapper },
      );

      const link = screen.getByTestId("link");

      expect(link).toHaveClass("class1", "class2", "active1", "active2");
    });

    it("should update activeClassName dynamically", async () => {
      await router.navigate("one-more-test");

      const TestComponent = () => {
        const [activeClass, setActiveClass] = useState("active1");

        return (
          <>
            <BaseLink
              router={router}
              routeName="one-more-test"
              activeClassName={activeClass}
              data-testid="link"
            >
              Test
            </BaseLink>
            <button
              onClick={() => {
                setActiveClass("active2");
              }}
              data-testid="change-class"
            >
              Change Class
            </button>
          </>
        );
      };

      render(<TestComponent />, { wrapper });

      expect(screen.getByTestId("link")).toHaveClass("active1");

      await user.click(screen.getByTestId("change-class"));

      expect(screen.getByTestId("link")).toHaveClass("active2");
      expect(screen.getByTestId("link")).not.toHaveClass("active1");
    });

    it("should handle className changes while active", async () => {
      await router.navigate("one-more-test");

      const { rerender } = render(
        <BaseLink
          router={router}
          routeName="one-more-test"
          className="base1"
          activeClassName="active"
          data-testid="link"
        >
          Test
        </BaseLink>,
        { wrapper },
      );

      expect(screen.getByTestId("link")).toHaveClass("base1", "active");

      rerender(
        <BaseLink
          router={router}
          routeName="one-more-test"
          className="base2"
          activeClassName="active"
          data-testid="link"
        >
          Test
        </BaseLink>,
      );

      expect(screen.getByTestId("link")).toHaveClass("base2", "active");
      expect(screen.getByTestId("link")).not.toHaveClass("base1");
    });

    it("should correctly toggle active class on route changes", async () => {
      render(
        <>
          <BaseLink
            router={router}
            routeName="one-more-test"
            activeClassName="active"
            data-testid="link1"
          >
            Link 1
          </BaseLink>
          <BaseLink
            router={router}
            routeName="users"
            activeClassName="active"
            data-testid="link2"
          >
            Link 2
          </BaseLink>
        </>,
        { wrapper },
      );

      // Navigate to first route
      await user.click(screen.getByTestId("link1"));

      await waitFor(() => {
        expect(screen.getByTestId("link1")).toHaveClass("active");
      });

      expect(screen.getByTestId("link2")).not.toHaveClass("active");

      // Navigate to second route
      await user.click(screen.getByTestId("link2"));

      await waitFor(() => {
        expect(screen.getByTestId("link2")).toHaveClass("active");
      });

      expect(screen.getByTestId("link1")).not.toHaveClass("active");
    });
  });

  describe("Accessibility and Semantics", () => {
    it("should preserve all passed props", () => {
      render(
        <BaseLink
          router={router}
          routeName="one-more-test"
          aria-label="Test link"
          role="link"
          tabIndex={0}
          data-testid="link"
        >
          Test
        </BaseLink>,
        { wrapper },
      );

      const link = screen.getByTestId("link");

      expect(link).toHaveAttribute("aria-label", "Test link");
      expect(link).toHaveAttribute("role", "link");
      expect(link).toHaveAttribute("tabIndex", "0");
    });

    it("should have data-route attribute", () => {
      render(
        <BaseLink router={router} routeName="one-more-test" data-testid="link">
          Test
        </BaseLink>,
        { wrapper },
      );

      expect(screen.getByTestId("link")).toHaveAttribute(
        "data-route",
        "one-more-test",
      );
    });

    it("should update data-active on route changes", async () => {
      render(
        <BaseLink router={router} routeName="one-more-test" data-testid="link">
          Test
        </BaseLink>,
        { wrapper },
      );

      const link = screen.getByTestId("link");

      // Initially not active
      expect(link).toHaveAttribute("data-active", "false");

      // Navigate to route
      await act(async () => {
        await router.navigate("one-more-test");
      });

      await waitFor(() => {
        expect(link).toHaveAttribute("data-active", "true");
      });
    });

    it("should support aria-current for active links", () => {
      render(
        <BaseLink
          router={router}
          routeName="one-more-test"
          aria-current="page"
          data-testid="link"
        >
          Test
        </BaseLink>,
        { wrapper },
      );

      expect(screen.getByTestId("link")).toHaveAttribute(
        "aria-current",
        "page",
      );
    });

    it("should maintain accessibility with custom className", () => {
      render(
        <BaseLink
          router={router}
          routeName="one-more-test"
          className="custom-link"
          activeClassName="custom-active"
          aria-label="Custom link"
          data-testid="link"
        >
          Test
        </BaseLink>,
        { wrapper },
      );

      const link = screen.getByTestId("link");

      expect(link).toHaveClass("custom-link");
      expect(link).toHaveAttribute("aria-label", "Custom link");
    });
  });

  describe("Browser Plugin Integration", () => {
    it("should use buildUrl when available", () => {
      const buildUrlSpy = vi.fn(() => "/custom-url");

      router.buildUrl = buildUrlSpy;

      render(
        <BaseLink router={router} routeName="one-more-test" data-testid="link">
          Test
        </BaseLink>,
        { wrapper },
      );

      expect(buildUrlSpy).toHaveBeenCalledWith("one-more-test", {});
      expect(screen.getByTestId("link")).toHaveAttribute("href", "/custom-url");
    });

    it("should fallback to buildPath when buildUrl unavailable", () => {
      const buildPathSpy = vi.spyOn(router, "buildPath");

      render(
        <BaseLink router={router} routeName="one-more-test" data-testid="link">
          Test
        </BaseLink>,
        { wrapper },
      );

      expect(buildPathSpy).toHaveBeenCalled();
    });

    it("should generate correct href with query params", () => {
      render(
        <BaseLink
          router={router}
          routeName="one-more-test"
          routeParams={{ id: "123", filter: "active" }}
          data-testid="link"
        >
          Test
        </BaseLink>,
        { wrapper },
      );

      const href = screen.getByTestId("link").getAttribute("href");

      expect(href).toContain("id=123");
      expect(href).toContain("filter=active");
    });

    it("should update href when routeParams change", () => {
      const { rerender } = render(
        <BaseLink
          router={router}
          routeName="one-more-test"
          routeParams={{ id: "1" }}
          data-testid="link"
        >
          Test
        </BaseLink>,
        { wrapper },
      );

      let href = screen.getByTestId("link").getAttribute("href");

      expect(href).toContain("id=1");

      rerender(
        <BaseLink
          router={router}
          routeName="one-more-test"
          routeParams={{ id: "2" }}
          data-testid="link"
        >
          Test
        </BaseLink>,
      );

      href = screen.getByTestId("link").getAttribute("href");

      expect(href).toContain("id=2");
      expect(href).not.toContain("id=1");
    });

    it("should handle complex query parameters", () => {
      render(
        <BaseLink
          router={router}
          routeName="one-more-test"
          routeParams={{
            search: "test query",
            sort: "asc",
            page: "1",
            filters: "active,pending",
          }}
          data-testid="link"
        >
          Test
        </BaseLink>,
        { wrapper },
      );

      const href = screen.getByTestId("link").getAttribute("href");

      expect(href).toContain("search=test");
      expect(href).toContain("sort=asc");
      expect(href).toContain("page=1");
      expect(href).toContain("filters=active");
    });
  });

  describe("State Management Integration", () => {
    it("should respond to router state changes", async () => {
      render(
        <BaseLink
          router={router}
          routeName="one-more-test"
          activeClassName="active"
          data-testid="link"
        >
          Test
        </BaseLink>,
        { wrapper },
      );

      expect(screen.getByTestId("link")).not.toHaveClass("active");

      // Programmatic navigation
      await act(async () => {
        await router.navigate("one-more-test");
      });

      await waitFor(() => {
        expect(screen.getByTestId("link")).toHaveClass("active");
      });
    });

    it("should handle router restart", async () => {
      const { rerender } = render(
        <BaseLink router={router} routeName="one-more-test" data-testid="link">
          Test
        </BaseLink>,
        { wrapper },
      );

      await user.click(screen.getByTestId("link"));

      await waitFor(() => {
        expect(router.getState()?.name).toBe("one-more-test");
      });

      // Stop and restart router
      router.stop();
      await router.start("/");

      rerender(
        <BaseLink router={router} routeName="users" data-testid="link">
          Test
        </BaseLink>,
      );

      await user.click(screen.getByTestId("link"));

      await waitFor(() => {
        expect(router.getState()?.name).toBe("users");
      });
    });
  });
});
