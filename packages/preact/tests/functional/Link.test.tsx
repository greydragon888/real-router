import { createRouter } from "@real-router/core";
import { screen, render, act, fireEvent } from "@testing-library/preact";
import { userEvent } from "@testing-library/user-event";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { Link, RouterProvider } from "@real-router/preact";

import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router } from "@real-router/core";
import type { ComponentChildren } from "preact";

describe("Link component", () => {
  let router: Router;
  const user = userEvent.setup();

  const wrapper = ({ children }: { children: ComponentChildren }) => (
    <RouterProvider router={router}>{children}</RouterProvider>
  );

  beforeEach(async () => {
    router = createTestRouterWithADefaultRouter();
    await router.start("/");
  });

  afterEach(() => {
    router.stop();
  });

  it("should renders component, href and children correctly", () => {
    render(
      <Link routeName="one-more-test" data-testid="link">
        Test
      </Link>,
      { wrapper },
    );

    expect(screen.getByTestId("link")).toBeInTheDocument();
    expect(screen.getByTestId("link")).toHaveTextContent("Test");
    expect(screen.getByTestId("link")).toHaveAttribute("href", "/test");
  });

  it("should renders component with passed class name", () => {
    const testClass = "test-class";

    render(
      <Link className={testClass} routeName="one-more-test" data-testid="link">
        Test
      </Link>,
      { wrapper },
    );

    expect(screen.getByTestId("link")).toBeInTheDocument();
    expect(screen.getByTestId("link")).toHaveClass(testClass);
  });

  describe("activeClassName", () => {
    it("should set active class if name current router state is same with link's route name", async () => {
      const linkRouteName = "one-more-test";

      render(
        <Link
          routeName={linkRouteName}
          activeClassName="active"
          data-testid="link"
        >
          Test
        </Link>,
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

      const { rerender } = render(
        <Link
          routeName={linkRouteName}
          routeParams={linkRouteParams}
          activeClassName="active"
          data-testid="link"
        >
          Test
        </Link>,
        { wrapper },
      );

      expect(router.getState()?.name).not.toStrictEqual(linkRouteName);
      expect(screen.getByTestId("link")).not.toHaveClass("active");

      await user.click(screen.getByTestId("link"));

      expect(router.getState()?.name).toStrictEqual(linkRouteName);
      expect(router.getState()?.params).toStrictEqual(linkRouteParams);
      expect(screen.getByTestId("link")).toHaveClass("active");

      const newLinkRouteParams = {
        ...linkRouteParams,
        a: "b",
        c: "d",
      };

      rerender(
        <Link
          routeName={linkRouteName}
          routeParams={newLinkRouteParams}
          activeClassName="active"
          data-testid="link"
        >
          Test
        </Link>,
      );

      expect(router.getState()?.name).toStrictEqual(linkRouteName);
      expect(router.getState()?.params).toStrictEqual(linkRouteParams);
      expect(screen.getByTestId("link")).toHaveClass("active");
    });

    it("should toggle active class based on ignoreQueryParams", async () => {
      const linkRouteName = "items.item";
      const linkRouteParams = { id: 6 };

      const { rerender } = render(
        <Link
          routeName={linkRouteName}
          routeParams={linkRouteParams}
          ignoreQueryParams={true}
          activeClassName="active"
          data-testid="link"
        >
          Test
        </Link>,
        { wrapper },
      );

      expect(screen.getByTestId("link")).not.toHaveClass("active");

      await act(async () => {
        await router.navigate(linkRouteName, {
          ...linkRouteParams,
          a: "b",
          c: "d",
        });
      });

      expect(screen.getByTestId("link")).toHaveClass("active");

      rerender(
        <Link
          routeName={linkRouteName}
          routeParams={linkRouteParams}
          ignoreQueryParams={false}
          activeClassName="active"
          data-testid="link"
        >
          Test
        </Link>,
      );

      await act(async () => {
        await router.navigate(linkRouteName, {
          ...linkRouteParams,
          e: "f",
          g: "h",
        });
      });

      expect(screen.getByTestId("link")).not.toHaveClass("active");
    });

    it("should add active class based on activeStrict", async () => {
      const activeClassName = "active";
      const parentRouteName = "items";
      const childRouteName = "items.item";
      const childRouteParams = { id: 6 };

      await act(async () => {
        await router.navigate(childRouteName, childRouteParams);
      });

      const { rerender } = render(
        <Link
          routeName={parentRouteName}
          activeStrict={false}
          activeClassName={activeClassName}
          data-testid="link"
        >
          Test
        </Link>,
        { wrapper },
      );

      expect(screen.getByTestId("link")).toHaveClass(activeClassName);

      await user.click(screen.getByTestId("link"));

      expect(router.getState()?.name).toStrictEqual(parentRouteName);
      expect(screen.getByTestId("link")).toHaveClass(activeClassName);

      rerender(
        <Link
          routeName={parentRouteName}
          activeStrict={true}
          activeClassName={activeClassName}
          data-testid="link"
        >
          Test
        </Link>,
      );

      await act(async () => {
        await router.navigate(childRouteName, childRouteParams);
      });

      expect(screen.getByTestId("link")).not.toHaveClass(activeClassName);
    });
  });

  describe("clickHandler", () => {
    it("should call onClick callback", async () => {
      const onClickMock = vi.fn();

      render(
        <Link routeName="test" onClick={onClickMock} data-testid="link">
          Test
        </Link>,
        { wrapper },
      );

      await user.click(screen.getByTestId("link"));

      expect(onClickMock).toHaveBeenCalled();
    });

    it("should prevent navigation on non-left click", async () => {
      const user = userEvent.setup();

      vi.spyOn(router, "navigate");

      const onClickMock = vi.fn();
      const currentRouteName = router.getState()?.name;
      const newRouteName = "one-more-test";

      render(
        <Link routeName={newRouteName} onClick={onClickMock} data-testid="link">
          Test
        </Link>,
        { wrapper },
      );

      fireEvent.click(screen.getByTestId("link"), { button: 1 });

      expect(onClickMock).toHaveBeenCalled();

      expect(router.navigate).not.toHaveBeenCalled();
      expect(router.getState()?.name).toStrictEqual(currentRouteName);

      vi.clearAllMocks();

      await user.keyboard("{Meta>}");
      await user.click(screen.getByTestId("link"));
      await user.keyboard("{/Meta}");

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
        <Link
          routeName="one-more-test"
          onClick={onClickMock}
          data-testid="link"
        >
          Test
        </Link>,
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
        <Link routeName="one-more-test" target="_blank" data-testid="link">
          Test
        </Link>,
        { wrapper },
      );

      fireEvent.click(screen.getByTestId("link"));

      expect(router.navigate).not.toHaveBeenCalled();
      expect(router.getState()?.name).toStrictEqual(currentRouteName);
    });
  });

  describe("URL Building", () => {
    it("should use buildPath when router has no buildUrl", async () => {
      const routerWithoutBuildUrl = createRouter([
        { name: "test", path: "/" },
        { name: "users", path: "/users" },
      ]);

      await routerWithoutBuildUrl.start("/");

      const wrapperWithoutBuildUrl = ({
        children,
      }: {
        children: ComponentChildren;
      }) => (
        <RouterProvider router={routerWithoutBuildUrl}>
          {children}
        </RouterProvider>
      );

      render(
        <Link routeName="users" data-testid="link">
          Users
        </Link>,
        { wrapper: wrapperWithoutBuildUrl },
      );

      expect(screen.getByTestId("link")).toHaveAttribute("href", "/users");

      routerWithoutBuildUrl.stop();
    });
  });

  describe("Props and Updates", () => {
    it("should update href when routeName changes", () => {
      const { rerender } = render(
        <Link routeName="users.list" data-testid="changing-link">
          Users
        </Link>,
        { wrapper },
      );

      const link = screen.getByTestId("changing-link");

      expect(link.getAttribute("href")).toContain("/users/list");

      rerender(
        <Link
          routeName="users.view"
          routeParams={{ id: "123" }}
          data-testid="changing-link"
        >
          User
        </Link>,
      );

      expect(link.getAttribute("href")).toContain("/users/123");
    });

    it("should update children when props change", () => {
      const { rerender } = render(
        <Link routeName="one-more-test" data-testid="link">
          Original Text
        </Link>,
        { wrapper },
      );

      expect(screen.getByTestId("link")).toHaveTextContent("Original Text");

      rerender(
        <Link routeName="one-more-test" data-testid="link">
          Updated Text
        </Link>,
      );

      expect(screen.getByTestId("link")).toHaveTextContent("Updated Text");
    });

    it("should handle routeOptions updates", () => {
      const { rerender } = render(
        <Link
          routeName="one-more-test"
          routeOptions={{ reload: false }}
          data-testid="link"
        >
          Test
        </Link>,
        { wrapper },
      );

      expect(screen.getByTestId("link")).toBeInTheDocument();

      rerender(
        <Link
          routeName="one-more-test"
          routeOptions={{ reload: true }}
          data-testid="link"
        >
          Test
        </Link>,
      );

      expect(screen.getByTestId("link")).toBeInTheDocument();
    });
  });

  it("should render without href and log error for invalid routeName", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    render(
      <Link routeName="@@nonexistent-route" data-testid="link">
        Test
      </Link>,
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
