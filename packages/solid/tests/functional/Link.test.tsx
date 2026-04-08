import { createRouter } from "@real-router/core";
import { render, screen } from "@solidjs/testing-library";
import { fireEvent } from "@testing-library/dom";
import { userEvent } from "@testing-library/user-event";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { Link, RouterProvider } from "@real-router/solid";

import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router } from "@real-router/core";
import type { JSX } from "solid-js";

describe("Link component", () => {
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

  it("should render component, href and children correctly", () => {
    render(
      () => (
        <Link routeName="one-more-test" data-testid="link">
          Test
        </Link>
      ),
      { wrapper },
    );

    expect(screen.getByTestId("link")).toBeInTheDocument();
    expect(screen.getByTestId("link")).toHaveTextContent("Test");
    expect(screen.getByTestId("link")).toHaveAttribute("href", "/test");
  });

  it("should render component with passed class name", () => {
    const testClass = "test-class";

    render(
      () => (
        <Link class={testClass} routeName="one-more-test" data-testid="link">
          Test
        </Link>
      ),
      { wrapper },
    );

    expect(screen.getByTestId("link")).toBeInTheDocument();
    expect(screen.getByTestId("link")).toHaveClass(testClass);
  });

  describe("activeClassName", () => {
    it("should set active class if name current router state is same with link's route name", async () => {
      const linkRouteName = "one-more-test";

      render(
        () => (
          <Link
            routeName={linkRouteName}
            activeClassName="active"
            data-testid="link"
          >
            Test
          </Link>
        ),
        { wrapper },
      );

      expect(router.getState()?.name).not.toStrictEqual(linkRouteName);
      expect(screen.getByTestId("link")).not.toHaveClass("active");

      await user.click(screen.getByTestId("link"));

      expect(router.getState()?.name).toStrictEqual(linkRouteName);
      expect(screen.getByTestId("link")).toHaveClass("active");
    });

    it("should set active class with route params", async () => {
      const linkRouteName = "items.item";
      const linkRouteParams = { id: 6 };

      render(
        () => (
          <Link
            routeName={linkRouteName}
            routeParams={linkRouteParams}
            activeClassName="active"
            data-testid="link"
          >
            Test
          </Link>
        ),
        { wrapper },
      );

      expect(router.getState()?.name).not.toStrictEqual(linkRouteName);
      expect(screen.getByTestId("link")).not.toHaveClass("active");

      await user.click(screen.getByTestId("link"));

      expect(router.getState()?.name).toStrictEqual(linkRouteName);
      expect(router.getState()?.params).toStrictEqual(linkRouteParams);
      expect(screen.getByTestId("link")).toHaveClass("active");
    });

    it("should add active class based on activeStrict", async () => {
      const activeClassName = "active";
      const parentRouteName = "items";
      const childRouteName = "items.item";
      const childRouteParams = { id: 6 };

      await router.navigate(childRouteName, childRouteParams);

      render(
        () => (
          <Link
            routeName={parentRouteName}
            activeStrict={false}
            activeClassName={activeClassName}
            data-testid="link"
          >
            Test
          </Link>
        ),
        { wrapper },
      );

      expect(screen.getByTestId("link")).toHaveClass(activeClassName);

      await user.click(screen.getByTestId("link"));

      expect(router.getState()?.name).toStrictEqual(parentRouteName);
      expect(screen.getByTestId("link")).toHaveClass(activeClassName);
    });
  });

  describe("clickHandler", () => {
    it("should call onClick callback", async () => {
      const onClickMock = vi.fn();

      render(
        () => (
          <Link routeName="test" onClick={onClickMock} data-testid="link">
            Test
          </Link>
        ),
        { wrapper },
      );

      await user.click(screen.getByTestId("link"));

      expect(onClickMock).toHaveBeenCalled();
    });

    it("should prevent navigation on non-left click", () => {
      vi.spyOn(router, "navigate");

      const onClickMock = vi.fn();
      const currentRouteName = router.getState()?.name;

      render(
        () => (
          <Link
            routeName="one-more-test"
            onClick={onClickMock}
            data-testid="link"
          >
            Test
          </Link>
        ),
        { wrapper },
      );

      fireEvent.click(screen.getByTestId("link"), { button: 1 });

      expect(onClickMock).toHaveBeenCalled();

      expect(router.navigate).not.toHaveBeenCalled();
      expect(router.getState()?.name).toStrictEqual(currentRouteName);
    });

    it("should not navigate when onClick prevents default", async () => {
      vi.spyOn(router, "navigate");
      const onClickMock = vi.fn((event: MouseEvent) => {
        event.preventDefault();
      });
      const currentRouteName = router.getState()?.name;

      render(
        () => (
          <Link
            routeName="one-more-test"
            onClick={onClickMock}
            data-testid="link"
          >
            Test
          </Link>
        ),
        { wrapper },
      );

      await user.click(screen.getByTestId("link"));

      expect(onClickMock).toHaveBeenCalled();

      expect(router.navigate).not.toHaveBeenCalled();
      expect(router.getState()?.name).toStrictEqual(currentRouteName);
    });

    it("should not navigate when target is _blank", () => {
      vi.spyOn(router, "navigate");
      const currentRouteName = router.getState()?.name;

      render(
        () => (
          <Link routeName="one-more-test" target="_blank" data-testid="link">
            Test
          </Link>
        ),
        { wrapper },
      );

      fireEvent.click(screen.getByTestId("link"));

      expect(router.navigate).not.toHaveBeenCalled();
      expect(router.getState()?.name).toStrictEqual(currentRouteName);
    });
  });

  describe("Class handling", () => {
    it("should have no class when not active and no class prop", () => {
      render(
        () => (
          <Link routeName="one-more-test" data-testid="link">
            Test
          </Link>
        ),
        { wrapper },
      );

      const link = screen.getByTestId("link");

      expect(link.className).toBe("");
    });

    it("should handle active without class prop", async () => {
      await router.navigate("one-more-test");

      render(
        () => (
          <Link routeName="one-more-test" data-testid="link">
            Test
          </Link>
        ),
        { wrapper },
      );

      expect(screen.getByTestId("link")).toHaveClass("active");
    });

    it("should toggle active class on ignoreQueryParams", async () => {
      const linkRouteName = "items.item";
      const linkRouteParams = { id: 6 };

      render(
        () => (
          <Link
            routeName={linkRouteName}
            routeParams={linkRouteParams}
            ignoreQueryParams={true}
            activeClassName="active"
            data-testid="link"
          >
            Test
          </Link>
        ),
        { wrapper },
      );

      expect(screen.getByTestId("link")).not.toHaveClass("active");

      await router.navigate(linkRouteName, {
        ...linkRouteParams,
        a: "b",
        c: "d",
      });

      expect(screen.getByTestId("link")).toHaveClass("active");
    });

    it("should combine class and activeClassName when both present and active", async () => {
      await router.navigate("one-more-test");

      render(
        () => (
          <Link
            routeName="one-more-test"
            class="base"
            activeClassName="active"
            data-testid="link"
          >
            Test
          </Link>
        ),
        { wrapper },
      );

      expect(screen.getByTestId("link")).toHaveClass("base", "active");
    });

    it("should return class only when active but empty activeClassName", async () => {
      await router.navigate("one-more-test");

      render(
        () => (
          <Link
            routeName="one-more-test"
            class="base"
            activeClassName=""
            data-testid="link"
          >
            Test
          </Link>
        ),
        { wrapper },
      );

      expect(screen.getByTestId("link")).toHaveClass("base");
      expect(screen.getByTestId("link")).not.toHaveClass("active");
    });
  });

  describe("URL Building", () => {
    it("should use buildPath when router has no buildUrl", async () => {
      const routerWithoutBuildUrl = createRouter([
        { name: "test", path: "/" },
        { name: "users", path: "/users" },
      ]);

      await routerWithoutBuildUrl.start("/");

      const wrapperWithoutBuildUrl = (props: { children: JSX.Element }) => (
        <RouterProvider router={routerWithoutBuildUrl}>
          {props.children}
        </RouterProvider>
      );

      render(
        () => (
          <Link routeName="users" data-testid="link">
            Users
          </Link>
        ),
        { wrapper: wrapperWithoutBuildUrl },
      );

      expect(screen.getByTestId("link")).toHaveAttribute("href", "/users");

      routerWithoutBuildUrl.stop();
    });
  });

  it("should navigate on keyboard Enter key", async () => {
    vi.spyOn(router, "navigate").mockResolvedValue({} as never);

    render(
      () => (
        <Link routeName="one-more-test" data-testid="link">
          Test
        </Link>
      ),
      { wrapper },
    );

    const link = screen.getByTestId("link");

    // Simulate pressing Enter on the link — browsers fire click on Enter for <a>
    fireEvent.keyDown(link, { key: "Enter" });
    fireEvent.click(link, { bubbles: true, cancelable: true });

    expect(router.navigate).toHaveBeenCalledWith(
      "one-more-test",
      expect.any(Object),
      expect.any(Object),
    );
  });

  it("should render without href and log error for invalid routeName", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    render(
      () => (
        <Link routeName="@@nonexistent-route" data-testid="link">
          Test
        </Link>
      ),
      { wrapper },
    );

    expect(screen.getByTestId("link")).toBeInTheDocument();
    expect(screen.getByTestId("link")).not.toHaveAttribute("href");
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining("@@nonexistent-route"),
    );

    consoleError.mockRestore();
  });
});
