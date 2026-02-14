import { createRouter } from "@real-router/core";
import { screen, render, act, fireEvent } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { BaseLink, RouterProvider } from "@real-router/react";

import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router } from "@real-router/core";
import type { MouseEvent, ReactNode } from "react";

describe("BaseLink component", () => {
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

  it("should renders component, href and children correctly", () => {
    render(
      <BaseLink router={router} routeName="one-more-test" data-testid="link">
        Test
      </BaseLink>,
      { wrapper },
    );

    expect(screen.getByTestId("link")).toBeInTheDocument();
    expect(screen.getByTestId("link")).toHaveTextContent("Test");
    expect(screen.getByTestId("link")).toHaveAttribute("href", "/test");
  });

  it("should renders component with passed class name", () => {
    const testClass = "test-class";

    render(
      <BaseLink
        router={router}
        className={testClass}
        routeName="one-more-test"
        data-testid="link"
      >
        Test
      </BaseLink>,
      { wrapper },
    );

    expect(screen.getByTestId("link")).toBeInTheDocument();
    expect(screen.getByTestId("link")).toHaveClass(testClass);
  });

  describe("activeClassName", () => {
    it("should set active class if name current router state is same with link's route name", async () => {
      const baseLinkRouteName = "one-more-test";

      render(
        <BaseLink
          router={router}
          routeName={baseLinkRouteName}
          activeClassName="active"
          data-testid="link"
        >
          Test
        </BaseLink>,
        { wrapper },
      );

      expect(router.getState()?.name).not.toStrictEqual(baseLinkRouteName);
      expect(screen.getByTestId("link")).not.toHaveClass("active");

      await user.click(screen.getByTestId("link"));

      expect(router.getState()?.name).toStrictEqual(baseLinkRouteName);
      expect(screen.getByTestId("link")).toHaveClass("active");
    });

    it("should set active class with route params", async () => {
      const baseLinkRouteName = "items.item";
      const baseLinkRouteParams = { id: 6 };

      const { rerender } = render(
        <BaseLink
          router={router}
          routeName={baseLinkRouteName}
          routeParams={baseLinkRouteParams}
          activeClassName="active"
          data-testid="link"
        >
          Test
        </BaseLink>,
        { wrapper },
      );

      expect(router.getState()?.name).not.toStrictEqual(baseLinkRouteName);
      expect(screen.getByTestId("link")).not.toHaveClass("active");

      await user.click(screen.getByTestId("link"));

      expect(router.getState()?.name).toStrictEqual(baseLinkRouteName);
      expect(router.getState()?.params).toStrictEqual(baseLinkRouteParams);
      expect(screen.getByTestId("link")).toHaveClass("active");

      const newBaseLinkRouteParams = {
        ...baseLinkRouteParams,
        a: "b",
        c: "d",
      };

      rerender(
        <BaseLink
          router={router}
          routeName={baseLinkRouteName}
          routeParams={newBaseLinkRouteParams}
          activeClassName="active"
          data-testid="link"
        >
          Test
        </BaseLink>,
      );

      expect(router.getState()?.name).toStrictEqual(baseLinkRouteName);
      expect(router.getState()?.params).toStrictEqual(baseLinkRouteParams);
      expect(screen.getByTestId("link")).toHaveClass("active");
    });

    it("should toggle active class based on ignoreQueryParams", async () => {
      const baseLinkRouteName = "items.item";
      const baseLinkRouteParams = { id: 6 };

      const { rerender } = render(
        <BaseLink
          router={router}
          routeName={baseLinkRouteName}
          routeParams={baseLinkRouteParams}
          ignoreQueryParams={true}
          activeClassName="active"
          data-testid="link"
        >
          Test
        </BaseLink>,
        { wrapper },
      );

      expect(screen.getByTestId("link")).not.toHaveClass("active");

      await act(() =>
        router.navigate(baseLinkRouteName, {
          ...baseLinkRouteParams,
          a: "b",
          c: "d",
        }),
      );

      expect(screen.getByTestId("link")).toHaveClass("active");

      rerender(
        <BaseLink
          router={router}
          routeName={baseLinkRouteName}
          routeParams={baseLinkRouteParams}
          ignoreQueryParams={false}
          activeClassName="active"
          data-testid="link"
        >
          Test
        </BaseLink>,
      );

      await act(() =>
        router.navigate(baseLinkRouteName, {
          ...baseLinkRouteParams,
          e: "f",
          g: "h",
        }),
      );

      expect(screen.getByTestId("link")).not.toHaveClass("active");
    });

    it("should add active class based on activeStrict", async () => {
      const activeClassName = "active";
      const parentRouteName = "items";
      const childRouteName = "items.item";
      const childRouteParams = { id: 6 };

      await act(() => router.navigate(childRouteName, childRouteParams));

      const { rerender } = render(
        <BaseLink
          router={router}
          routeName={parentRouteName}
          activeStrict={false}
          activeClassName={activeClassName}
          data-testid="link"
        >
          Test
        </BaseLink>,
        { wrapper },
      );

      expect(screen.getByTestId("link")).toHaveClass(activeClassName);

      await user.click(screen.getByTestId("link"));

      expect(router.getState()?.name).toStrictEqual(parentRouteName);
      expect(screen.getByTestId("link")).toHaveClass(activeClassName);

      rerender(
        <BaseLink
          router={router}
          routeName={parentRouteName}
          activeStrict={true}
          activeClassName={activeClassName}
          data-testid="link"
        >
          Test
        </BaseLink>,
      );

      await act(() => router.navigate(childRouteName, childRouteParams));

      expect(screen.getByTestId("link")).not.toHaveClass(activeClassName);
    });
  });

  describe("clickHandler", () => {
    it("should call onClick callback", async () => {
      const onClickMock = vi.fn();

      render(
        <BaseLink
          router={router}
          routeName="test"
          onClick={onClickMock}
          data-testid="link"
        >
          Test
        </BaseLink>,
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
        <BaseLink
          router={router}
          routeName={newRouteName}
          onClick={onClickMock}
          data-testid="link"
        >
          Test
        </BaseLink>,
        { wrapper },
      );

      // Middle click
      fireEvent.click(screen.getByTestId("link"), { button: 1 });

      expect(onClickMock).toHaveBeenCalled();
      // eslint-disable-next-line @typescript-eslint/unbound-method -- spied method
      expect(router.navigate).not.toHaveBeenCalled();
      expect(router.getState()?.name).toStrictEqual(currentRouteName);

      vi.clearAllMocks();

      // Click with modifier keys
      await user.keyboard("{Meta>}");
      await user.click(screen.getByTestId("link"));
      await user.keyboard("{/Meta}");

      expect(onClickMock).toHaveBeenCalled();
      // eslint-disable-next-line @typescript-eslint/unbound-method -- spied method
      expect(router.navigate).not.toHaveBeenCalled();
      expect(router.getState()?.name).toStrictEqual(currentRouteName);
    });

    it("should not navigate when onClick prevents default", async () => {
      vi.spyOn(router, "navigate");
      const onClickMock = vi.fn((e: MouseEvent) => {
        e.preventDefault();
      });
      const currentRouteName = router.getState()?.name;

      render(
        <BaseLink
          router={router}
          routeName="one-more-test"
          onClick={onClickMock}
          data-testid="link"
        >
          Test
        </BaseLink>,
        { wrapper },
      );

      await user.click(screen.getByTestId("link"));

      expect(onClickMock).toHaveBeenCalled();
      // eslint-disable-next-line @typescript-eslint/unbound-method -- spied method
      expect(router.navigate).not.toHaveBeenCalled();
      expect(router.getState()?.name).toStrictEqual(currentRouteName);
    });

    it("should not navigate when target is _blank", () => {
      vi.spyOn(router, "navigate");
      const currentRouteName = router.getState()?.name;

      render(
        <BaseLink
          router={router}
          routeName="one-more-test"
          target="_blank"
          data-testid="link"
        >
          Test
        </BaseLink>,
        { wrapper },
      );

      fireEvent.click(screen.getByTestId("link"));

      // eslint-disable-next-line @typescript-eslint/unbound-method -- spied method
      expect(router.navigate).not.toHaveBeenCalled();
      expect(router.getState()?.name).toStrictEqual(currentRouteName);
    });
  });

  describe("URL Building", () => {
    it("should use buildPath when router has no buildUrl", async () => {
      // Create router without browser plugin (no buildUrl method)
      const routerWithoutBuildUrl = createRouter([
        { name: "test", path: "/" },
        { name: "users", path: "/users" },
      ]);

      await routerWithoutBuildUrl.start("/");

      const wrapperWithoutBuildUrl = ({
        children,
      }: {
        children: ReactNode;
      }) => (
        <RouterProvider router={routerWithoutBuildUrl}>
          {children}
        </RouterProvider>
      );

      render(
        <BaseLink
          router={routerWithoutBuildUrl}
          routeName="users"
          data-testid="link"
        >
          Users
        </BaseLink>,
        { wrapper: wrapperWithoutBuildUrl },
      );

      // Without buildUrl, BaseLink falls back to buildPath
      expect(screen.getByTestId("link")).toHaveAttribute("href", "/users");

      routerWithoutBuildUrl.stop();
    });
  });

  describe("Props and Updates", () => {
    it("should update href when routeName changes", () => {
      const { rerender } = render(
        <BaseLink
          router={router}
          routeName="users.list"
          data-testid="changing-link"
        >
          Users
        </BaseLink>,
        { wrapper },
      );

      const link = screen.getByTestId("changing-link");

      expect(link.getAttribute("href")).toContain("/users/list");

      rerender(
        <BaseLink
          router={router}
          routeName="users.view"
          routeParams={{ id: "123" }}
          data-testid="changing-link"
        >
          User
        </BaseLink>,
      );

      expect(link.getAttribute("href")).toContain("/users/123");
    });

    it("should update children when props change", () => {
      const { rerender } = render(
        <BaseLink router={router} routeName="one-more-test" data-testid="link">
          Original Text
        </BaseLink>,
        { wrapper },
      );

      expect(screen.getByTestId("link")).toHaveTextContent("Original Text");

      rerender(
        <BaseLink router={router} routeName="one-more-test" data-testid="link">
          Updated Text
        </BaseLink>,
      );

      expect(screen.getByTestId("link")).toHaveTextContent("Updated Text");
    });

    it("should handle routeOptions updates", () => {
      const { rerender } = render(
        <BaseLink
          router={router}
          routeName="one-more-test"
          routeOptions={{ reload: false }}
          data-testid="link"
        >
          Test
        </BaseLink>,
        { wrapper },
      );

      expect(screen.getByTestId("link")).toBeInTheDocument();

      rerender(
        <BaseLink
          router={router}
          routeName="one-more-test"
          routeOptions={{ reload: true }}
          data-testid="link"
        >
          Test
        </BaseLink>,
      );

      expect(screen.getByTestId("link")).toBeInTheDocument();
    });
  });
});
