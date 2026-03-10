import { getLifecycleApi } from "@real-router/core";
import {
  screen,
  render,
  act,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { useState } from "react";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { Link, RouterProvider } from "@real-router/react";

import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router, State } from "@real-router/core";
import type { ReactNode } from "react";

describe("Link - Integration Tests", () => {
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
          <Link routeName="one-more-test" data-testid="link1">
            Link 1
          </Link>
          <Link routeName="users" data-testid="link2">
            Link 2
          </Link>
        </>,
        { wrapper },
      );

      await user.click(screen.getByTestId("link1"));

      await waitFor(() => {
        expect(router.getState()?.name).toBe("one-more-test");
      });

      await user.click(screen.getByTestId("link2"));

      await waitFor(() => {
        expect(router.getState()?.name).toBe("users");
      });
    });

    it("should handle multiple rapid clicks correctly", async () => {
      render(
        <Link routeName="one-more-test" data-testid="link">
          Test Link
        </Link>,
        { wrapper },
      );

      const link = screen.getByTestId("link");

      for (let i = 0; i < 10; i++) {
        await user.click(link);
      }

      await waitFor(() => {
        expect(router.getState()?.name).toBe("one-more-test");
      });
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
        <Link routeName="one-more-test" data-testid="link">
          Test Link
        </Link>,
        { wrapper },
      );

      await user.click(screen.getByTestId("link"));

      await waitFor(() => {
        expect(router.getState()?.name).not.toBe("one-more-test");
      });

      shouldFail = false;
      await user.click(screen.getByTestId("link"));

      await waitFor(() => {
        expect(router.getState()?.name).toBe("one-more-test");
      });
    });

    it("should handle sequential navigation to different routes", async () => {
      const routes = ["one-more-test", "users", "items"];
      const links = routes.map((route) => (
        <Link key={route} routeName={route} data-testid={`link-${route}`}>
          {route}
        </Link>
      ));

      render(<div>{links}</div>, { wrapper });

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
        <Link routeName="one-more-test" data-testid="link">
          Test
        </Link>,
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
        <Link routeName="one-more-test" data-testid="link">
          Test Link
        </Link>,
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
        <Link routeName="one-more-test" onClick={onClickSpy} data-testid="link">
          Test Link
        </Link>,
        { wrapper },
      );

      fireEvent.click(screen.getByTestId("link"), { shiftKey: true });

      expect(onClickSpy).toHaveBeenCalled();
    });

    it("should handle keyboard navigation (Enter key)", async () => {
      render(
        <Link routeName="one-more-test" data-testid="link">
          Test
        </Link>,
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
        <Link
          routeName="one-more-test"
          activeClassName=""
          className="base-class"
          data-testid="link"
        >
          Test
        </Link>,
        { wrapper },
      );

      const link = screen.getByTestId("link");

      expect(link).toHaveClass("base-class");
      expect(link.className).toBe("base-class");
    });

    it("should handle multiple classes correctly", async () => {
      await router.navigate("one-more-test");

      render(
        <Link
          routeName="one-more-test"
          className="class1 class2"
          activeClassName="active1 active2"
          data-testid="link"
        >
          Test
        </Link>,
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
            <Link
              routeName="one-more-test"
              activeClassName={activeClass}
              data-testid="link"
            >
              Test
            </Link>
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
        <Link
          routeName="one-more-test"
          className="base1"
          activeClassName="active"
          data-testid="link"
        >
          Test
        </Link>,
        { wrapper },
      );

      expect(screen.getByTestId("link")).toHaveClass("base1", "active");

      rerender(
        <Link
          routeName="one-more-test"
          className="base2"
          activeClassName="active"
          data-testid="link"
        >
          Test
        </Link>,
      );

      expect(screen.getByTestId("link")).toHaveClass("base2", "active");
      expect(screen.getByTestId("link")).not.toHaveClass("base1");
    });

    it("should correctly toggle active class on route changes", async () => {
      render(
        <>
          <Link
            routeName="one-more-test"
            activeClassName="active"
            data-testid="link1"
          >
            Link 1
          </Link>
          <Link routeName="users" activeClassName="active" data-testid="link2">
            Link 2
          </Link>
        </>,
        { wrapper },
      );

      await user.click(screen.getByTestId("link1"));

      await waitFor(() => {
        expect(screen.getByTestId("link1")).toHaveClass("active");
      });

      expect(screen.getByTestId("link2")).not.toHaveClass("active");

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
        <Link
          routeName="one-more-test"
          aria-label="Test link"
          role="link"
          tabIndex={0}
          data-testid="link"
        >
          Test
        </Link>,
        { wrapper },
      );

      const link = screen.getByTestId("link");

      expect(link).toHaveAttribute("aria-label", "Test link");
      expect(link).toHaveAttribute("role", "link");
      expect(link).toHaveAttribute("tabIndex", "0");
    });

    it("should support aria-current for active links", () => {
      render(
        <Link routeName="one-more-test" aria-current="page" data-testid="link">
          Test
        </Link>,
        { wrapper },
      );

      expect(screen.getByTestId("link")).toHaveAttribute(
        "aria-current",
        "page",
      );
    });

    it("should maintain accessibility with custom className", () => {
      render(
        <Link
          routeName="one-more-test"
          className="custom-link"
          activeClassName="custom-active"
          aria-label="Custom link"
          data-testid="link"
        >
          Test
        </Link>,
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
        <Link routeName="one-more-test" data-testid="link">
          Test
        </Link>,
        { wrapper },
      );

      expect(buildUrlSpy).toHaveBeenCalledWith("one-more-test", {});
      expect(screen.getByTestId("link")).toHaveAttribute("href", "/custom-url");
    });

    it("should fallback to buildPath when buildUrl unavailable", () => {
      const buildPathSpy = vi.spyOn(router, "buildPath");

      render(
        <Link routeName="one-more-test" data-testid="link">
          Test
        </Link>,
        { wrapper },
      );

      expect(buildPathSpy).toHaveBeenCalled();
    });

    it("should generate correct href with query params", () => {
      render(
        <Link
          routeName="one-more-test"
          routeParams={{ id: "123", filter: "active" }}
          data-testid="link"
        >
          Test
        </Link>,
        { wrapper },
      );

      const href = screen.getByTestId("link").getAttribute("href");

      expect(href).toContain("id=123");
      expect(href).toContain("filter=active");
    });

    it("should update href when routeParams change", () => {
      const { rerender } = render(
        <Link
          routeName="one-more-test"
          routeParams={{ id: "1" }}
          data-testid="link"
        >
          Test
        </Link>,
        { wrapper },
      );

      let href = screen.getByTestId("link").getAttribute("href");

      expect(href).toContain("id=1");

      rerender(
        <Link
          routeName="one-more-test"
          routeParams={{ id: "2" }}
          data-testid="link"
        >
          Test
        </Link>,
      );

      href = screen.getByTestId("link").getAttribute("href");

      expect(href).toContain("id=2");
      expect(href).not.toContain("id=1");
    });

    it("should handle complex query parameters", () => {
      render(
        <Link
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
        </Link>,
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
        <Link
          routeName="one-more-test"
          activeClassName="active"
          data-testid="link"
        >
          Test
        </Link>,
        { wrapper },
      );

      expect(screen.getByTestId("link")).not.toHaveClass("active");

      await act(async () => {
        await router.navigate("one-more-test");
      });

      await waitFor(() => {
        expect(screen.getByTestId("link")).toHaveClass("active");
      });
    });

    it("should handle router restart", async () => {
      const { rerender } = render(
        <Link routeName="one-more-test" data-testid="link">
          Test
        </Link>,
        { wrapper },
      );

      await user.click(screen.getByTestId("link"));

      await waitFor(() => {
        expect(router.getState()?.name).toBe("one-more-test");
      });

      router.stop();
      await router.start("/");

      rerender(
        <Link routeName="users" data-testid="link">
          Test
        </Link>,
      );

      await user.click(screen.getByTestId("link"));

      await waitFor(() => {
        expect(router.getState()?.name).toBe("users");
      });
    });
  });
});
