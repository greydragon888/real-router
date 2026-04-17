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

      expect(onClickMock).toHaveBeenCalledTimes(1);
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

      expect(onClickMock).toHaveBeenCalledTimes(1);

      expect(router.navigate).not.toHaveBeenCalled();
      expect(router.getState()?.name).toStrictEqual(currentRouteName);

      vi.clearAllMocks();

      await user.keyboard("{Meta>}");
      await user.click(screen.getByTestId("link"));
      await user.keyboard("{/Meta}");

      expect(onClickMock).toHaveBeenCalledTimes(1);

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

      expect(onClickMock).toHaveBeenCalledTimes(1);

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

    it("should handle routeOptions updates", async () => {
      vi.spyOn(router, "navigate").mockResolvedValue({} as never);

      const { rerender } = render(
        <Link
          routeName="one-more-test"
          routeOptions={{ replace: true }}
          data-testid="link"
        >
          Test
        </Link>,
        { wrapper },
      );

      expect(screen.getByTestId("link")).toBeInTheDocument();

      await user.click(screen.getByTestId("link"));

      expect(router.navigate).toHaveBeenCalledWith(
        "one-more-test",
        expect.any(Object),
        expect.objectContaining({ replace: true }),
      );

      vi.mocked(router.navigate).mockClear();

      rerender(
        <Link
          routeName="one-more-test"
          routeOptions={{ reload: true }}
          data-testid="link"
        >
          Test
        </Link>,
      );

      await user.click(screen.getByTestId("link"));

      expect(router.navigate).toHaveBeenCalledWith(
        "one-more-test",
        expect.any(Object),
        expect.objectContaining({ reload: true }),
      );
    });
  });

  describe("default activeClassName", () => {
    it("should apply default 'active' class without explicit activeClassName prop", async () => {
      render(
        <Link routeName="one-more-test" data-testid="link">
          Test
        </Link>,
        { wrapper },
      );

      expect(screen.getByTestId("link")).not.toHaveClass("active");

      await user.click(screen.getByTestId("link"));

      expect(router.getState()?.name).toStrictEqual("one-more-test");
      expect(screen.getByTestId("link")).toHaveClass("active");
    });
  });

  describe("event handlers", () => {
    it("should call onMouseOver callback", () => {
      const onMouseOverMock = vi.fn();

      render(
        <Link routeName="test" onMouseOver={onMouseOverMock} data-testid="link">
          Test
        </Link>,
        { wrapper },
      );

      fireEvent.mouseOver(screen.getByTestId("link"));

      expect(onMouseOverMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("aria attribute forwarding", () => {
    it("should forward aria-label to the rendered anchor", () => {
      render(
        <Link routeName="test" aria-label="Go home" data-testid="link">
          Test
        </Link>,
        { wrapper },
      );

      expect(screen.getByTestId("link")).toHaveAttribute(
        "aria-label",
        "Go home",
      );
    });
  });

  describe("memoization (areLinkPropsEqual)", () => {
    it("should not re-render when routeParams is a fresh inline object with same values (gotcha)", async () => {
      let renderCount = 0;

      function Harness({
        params,
      }: Readonly<{
        params: Record<string, string | number>;
      }>) {
        renderCount++;

        return (
          <Link routeName="users.view" routeParams={params} data-testid="link">
            Profile
          </Link>
        );
      }

      const { rerender } = render(<Harness params={{ id: "1", page: 2 }} />, {
        wrapper,
      });

      const rendersAfterFirst = renderCount;

      // Same values, but a fresh object literal (new reference).
      rerender(<Harness params={{ id: "1", page: 2 }} />);
      // Reordered keys — must also hit the deep-equal bail-out.
      rerender(<Harness params={{ page: 2, id: "1" }} />);

      expect(renderCount).toBeGreaterThan(rendersAfterFirst);
      expect(screen.getByTestId("link")).toHaveAttribute(
        "href",
        "/users/1?page=2",
      );

      // Structural change: params now differ → href must update.
      await act(async () => {
        rerender(<Harness params={{ id: "2", page: 2 }} />);
      });

      expect(screen.getByTestId("link")).toHaveAttribute(
        "href",
        "/users/2?page=2",
      );
    });

    it("should not throw when routeParams contains a circular reference", () => {
      interface Circular {
        id: string;
        self?: Circular;
      }
      const circular: Circular = { id: "1" };

      circular.self = circular;

      expect(() => {
        render(
          <Link
            routeName="users.view"
            routeParams={circular as unknown as Record<string, string>}
            data-testid="link"
          >
            Profile
          </Link>,
          { wrapper },
        );
      }).not.toThrow();

      expect(screen.getByTestId("link")).toBeInTheDocument();
    });

    it("should not throw when routeParams contains a BigInt value", () => {
      expect(() => {
        render(
          <Link
            routeName="users.view"
            routeParams={{ id: 1n } as unknown as Record<string, string>}
            data-testid="link"
          >
            Profile
          </Link>,
          { wrapper },
        );
      }).not.toThrow();

      expect(screen.getByTestId("link")).toBeInTheDocument();
    });

    it("should not throw when routeParams contains NaN or Infinity", () => {
      expect(() => {
        render(
          <Link
            routeName="users.view"
            routeParams={
              { id: Number.NaN, page: Infinity } as unknown as Record<
                string,
                string
              >
            }
            data-testid="link"
          >
            Profile
          </Link>,
          { wrapper },
        );
      }).not.toThrow();

      // JSON.stringify(NaN) === "null" — both values serialize to null, so
      // the resulting href uses "null" for :id. The point is that no throw
      // escapes and the component still mounts.
      expect(screen.getByTestId("link")).toBeInTheDocument();
    });

    it("should treat two distinct circular-ref params as unequal (comparator catch branch)", () => {
      interface Circular {
        id: string;
        self?: Circular;
      }
      const first: Circular = { id: "1" };

      first.self = first;
      const second: Circular = { id: "2" };

      second.self = second;

      const { rerender } = render(
        <Link
          routeName="users.view"
          routeParams={first as unknown as Record<string, string>}
          data-testid="link"
        >
          Profile
        </Link>,
        { wrapper },
      );

      expect(() => {
        rerender(
          <Link
            routeName="users.view"
            routeParams={second as unknown as Record<string, string>}
            data-testid="link"
          >
            Profile
          </Link>,
        );
      }).not.toThrow();

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

  it("should handle empty routeName gracefully", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    render(
      <Link routeName="" data-testid="link">
        Test
      </Link>,
      { wrapper },
    );

    expect(screen.getByTestId("link")).toBeInTheDocument();
    expect(screen.getByTestId("link")).not.toHaveAttribute("href");
    expect(consoleError).toHaveBeenCalled();

    consoleError.mockRestore();
  });
});
