import { createRouter } from "@real-router/core";
import { createActiveRouteSource } from "@real-router/sources";
import { screen, render, act, fireEvent } from "@testing-library/preact";
import { userEvent } from "@testing-library/user-event";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { Link, RouterProvider } from "@real-router/preact";

import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router, State } from "@real-router/core";
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

    it("should default ignoreQueryParams to true when prop is omitted (gotcha)", async () => {
      const linkRouteName = "items.item";
      const linkRouteParams = { id: 6 };

      render(
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

      await act(async () => {
        await router.navigate(linkRouteName, {
          ...linkRouteParams,
          page: 2,
        });
      });

      // Without an explicit `ignoreQueryParams` prop, the default is `true`:
      // the link is active even though the current URL carries `?page=2` that
      // the link does not declare. Locks the documented CLAUDE.md gotcha.
      expect(screen.getByTestId("link")).toHaveClass("active");
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

    it("still navigates (isolated) when the onClick handler throws (#1436)", async () => {
      // Native <a> semantics: a throwing click listener is logged and the
      // default action still runs — mirrors vue's #1352 isolation. Pre-fix the
      // throw escapes handleClick before navigateWithHash, aborting navigation.
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      vi.spyOn(router, "navigate");
      const onClickMock = vi.fn(() => {
        throw new Error("boom");
      });

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

      // Swallow the pre-fix propagated throw so the discriminating asserts run.
      try {
        await user.click(screen.getByTestId("link"));
      } catch {
        /* pre-fix: unisolated throw */
      }

      expect(onClickMock).toHaveBeenCalledTimes(1);
      expect(router.navigate).toHaveBeenCalledTimes(1);
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("[real-router]"),
        expect.any(Error),
      );

      errorSpy.mockRestore();
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

    it("should not navigate on altKey click", async () => {
      vi.spyOn(router, "navigate");

      render(
        <Link routeName="one-more-test" data-testid="link">
          Test
        </Link>,
        { wrapper },
      );

      fireEvent.click(screen.getByTestId("link"), { altKey: true });

      expect(router.navigate).not.toHaveBeenCalled();
    });

    it("should not navigate on shiftKey click", async () => {
      vi.spyOn(router, "navigate");

      render(
        <Link routeName="one-more-test" data-testid="link">
          Test
        </Link>,
        { wrapper },
      );

      fireEvent.click(screen.getByTestId("link"), { shiftKey: true });

      expect(router.navigate).not.toHaveBeenCalled();
    });

    it("should not navigate on ctrlKey click", async () => {
      vi.spyOn(router, "navigate");

      render(
        <Link routeName="one-more-test" data-testid="link">
          Test
        </Link>,
        { wrapper },
      );

      fireEvent.click(screen.getByTestId("link"), { ctrlKey: true });

      expect(router.navigate).not.toHaveBeenCalled();
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
      vi.spyOn(router, "navigate").mockResolvedValue({} as State);

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

    it("should fall back to baseClassName when activeClassName is whitespace-only", async () => {
      render(
        <Link
          routeName="one-more-test"
          className="base"
          activeClassName="   "
          data-testid="link"
        >
          Test
        </Link>,
        { wrapper },
      );

      expect(screen.getByTestId("link")).toHaveClass("base");

      await user.click(screen.getByTestId("link"));

      // Active, but `parseTokens(' ')` → []; result must equal baseClassName,
      // not " base" (no double-space, no leading whitespace, no extra tokens).
      expect(screen.getByTestId("link").className).toBe("base");
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

      expect(renderCount).toBe(rendersAfterFirst + 2);
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

    it("should re-render when routeParams contains a nested object with new ref (gotcha)", () => {
      // Locks the CLAUDE.md gotcha: shallowEqual compares routeParams values
      // via Object.is per key. A nested object has a fresh reference each
      // render even when its values are equal — Link cannot bail out without
      // a deep compare, so the consumer must stabilise via `useMemo` if they
      // care about the re-render. This test confirms the documented behaviour.
      const linkRenders = vi.fn();

      function ProbedLink({
        params,
      }: Readonly<{
        params: Record<string, string | Record<string, string>>;
      }>) {
        linkRenders();

        return (
          <Link
            routeName="users.view"
            routeParams={params}
            data-testid="nested-link"
          >
            Profile (nested params)
          </Link>
        );
      }

      const nested = { sort: "asc" };
      const { rerender } = render(
        <ProbedLink params={{ id: "1", filters: nested }} />,
        { wrapper },
      );

      const baseline = linkRenders.mock.calls.length;

      // Each rerender constructs a fresh nested `filters` object literal —
      // shallowEqual sees different refs at the `filters` key and lets the
      // wrapper through. Number of Link instantiations grows accordingly.
      rerender(<ProbedLink params={{ id: "1", filters: { sort: "asc" } }} />);
      rerender(<ProbedLink params={{ id: "1", filters: { sort: "asc" } }} />);

      expect(linkRenders.mock.calls.length).toBeGreaterThan(baseline);
    });

    it("regression-guard: LinkProps own-key surface matches areLinkPropsEqual coverage (review §8a Link.tsx MEDIUM)", () => {
      // Type-level lock. The `areLinkPropsEqual` JSDoc in `Link.tsx` requires
      // every LinkProps OWN field (not inherited HTMLAttributes) to appear in
      // the comparator's `&&` chain. If a future PR adds a new field to
      // `LinkProps` in `packages/preact/src/types.ts` without updating this
      // list AND `areLinkPropsEqual`, the type assertion below fails to
      // compile (one of the `extends` clauses produces `false`), forcing a
      // coordinated edit:
      //   1. extend the `LinkPropsOwnKey` union with the new field
      //   2. extend `areLinkPropsEqual` to compare it
      //   3. extend the `expected` list here
      //
      // The runtime body is a tautology — the value is verified by the
      // TypeScript compile step (turbo `type-check` task is part of `build`).
      const expected = [
        "routeName",
        "routeParams",
        "routeOptions",
        "className",
        "activeClassName",
        "activeStrict",
        "ignoreQueryParams",
        "hash",
        "target",
      ] as const;

      type ExpectedKey = (typeof expected)[number];
      type LinkPropsOwnKey =
        | "routeName"
        | "routeParams"
        | "routeOptions"
        | "className"
        | "activeClassName"
        | "activeStrict"
        | "ignoreQueryParams"
        | "hash"
        | "target";
      type Equal = [ExpectedKey] extends [LinkPropsOwnKey]
        ? [LinkPropsOwnKey] extends [ExpectedKey]
          ? true
          : false
        : false;
      const same: Equal = true;

      expect(same).toBe(true);
      expect(expected).toHaveLength(9);
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
            // @ts-expect-error -- Circular has no index signature; testing runtime resilience with structurally invalid params
            routeParams={circular}
            data-testid="link"
          >
            Profile
          </Link>,
          { wrapper },
        );
      }).not.toThrow();

      expect(screen.getByTestId("link")).toBeInTheDocument();
      // href IS present: buildHref's catch branch did not fire; circular `self`
      // gets stringified as "[object Object]" in the query string (loose mode).
      expect(screen.getByTestId("link")).toHaveAttribute(
        "href",
        "/users/1?self=%5Bobject%20Object%5D",
      );
    });

    it("should not throw when routeParams contains a BigInt value", () => {
      expect(() => {
        render(
          <Link
            routeName="users.view"
            // @ts-expect-error -- bigint is not a valid Params value; testing runtime resilience
            routeParams={{ id: 1n }}
            data-testid="link"
          >
            Profile
          </Link>,
          { wrapper },
        );
      }).not.toThrow();

      expect(screen.getByTestId("link")).toBeInTheDocument();
      expect(screen.getByTestId("link")).toHaveAttribute("href", "/users/1");
    });

    it("should not throw when routeParams contains NaN or Infinity", () => {
      expect(() => {
        render(
          <Link
            routeName="users.view"
            routeParams={{ id: Number.NaN, page: Infinity }}
            data-testid="link"
          >
            Profile
          </Link>,
          { wrapper },
        );
      }).not.toThrow();

      expect(screen.getByTestId("link")).toBeInTheDocument();
      // NaN path segment → "NaN"; Infinity query param → "Infinity" (loose mode).
      expect(screen.getByTestId("link")).toHaveAttribute(
        "href",
        "/users/NaN?page=Infinity",
      );
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
          // @ts-expect-error -- Circular has no index signature; testing runtime resilience with structurally invalid params
          routeParams={first}
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
            // @ts-expect-error -- Circular has no index signature; testing runtime resilience with structurally invalid params
            routeParams={second}
            data-testid="link"
          >
            Profile
          </Link>,
        );
      }).not.toThrow();

      expect(screen.getByTestId("link")).toBeInTheDocument();
      // href changed to reflect `second` (id "2") — proves memo did NOT bail out:
      // shallowEqual(first, second) is false because id "1" ≠ "2", so a re-render
      // happened and buildHref was called with the new params.
      expect(screen.getByTestId("link")).toHaveAttribute(
        "href",
        "/users/2?self=%5Bobject%20Object%5D",
      );
    });
  });

  it("should render without href and log error for invalid routeName", async () => {
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

    // Clicking a no-href link fires navigate (which rejects for unknown route),
    // but the .catch(() => {}) in handleClick swallows the error — router state
    // stays unchanged, confirming the click is a no-op from the user's view.
    fireEvent.click(screen.getByTestId("link"));
    await Promise.resolve();

    expect(router.getState()).toBeDefined();
    expect(router.getState()?.name).toBe("test");

    consoleError.mockRestore();
  });

  it("should handle empty routeName gracefully", async () => {
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

    // Same no-op contract: clicking leaves the router state unchanged.
    fireEvent.click(screen.getByTestId("link"));
    await Promise.resolve();

    expect(router.getState()).toBeDefined();
    expect(router.getState()?.name).toBe("test");

    consoleError.mockRestore();
  });

  describe("hash prop (buildHref edge cases)", () => {
    it("hash prop appends encoded fragment to href", () => {
      render(
        <Link routeName="one-more-test" hash="section" data-testid="link">
          Test
        </Link>,
        { wrapper },
      );

      const href = screen.getByTestId("link").getAttribute("href");

      expect(href).toMatch(/#section$/);
    });

    it("hash with leading '#' strips the prefix (hash='#section' === hash='section')", () => {
      const { rerender } = render(
        <Link routeName="one-more-test" hash="section" data-testid="link">
          Test
        </Link>,
        { wrapper },
      );

      const hrefWithout = screen.getByTestId("link").getAttribute("href");

      rerender(
        <Link routeName="one-more-test" hash="#section" data-testid="link">
          Test
        </Link>,
      );

      const hrefWith = screen.getByTestId("link").getAttribute("href");

      expect(hrefWith).toBe(hrefWithout);
    });

    it("empty hash prop produces no fragment in href", () => {
      render(
        <Link routeName="one-more-test" hash="" data-testid="link">
          Test
        </Link>,
        { wrapper },
      );

      const href = screen.getByTestId("link").getAttribute("href");

      expect(href).not.toContain("#");
    });

    it("hash containing '#' encodes inner '#' as %23", () => {
      // A fragment value that itself contains a '#' must be encoded as %23
      // so the browser does not interpret it as a second fragment delimiter.
      render(
        <Link routeName="one-more-test" hash="a#b" data-testid="link">
          Test
        </Link>,
        { wrapper },
      );

      const href = screen.getByTestId("link").getAttribute("href");

      // Inner '#' must be %23; the URL must have exactly one real '#'.
      expect(href).toMatch(/%23/);
      expect(href?.split("#").length).toBe(2);
    });

    it("buildActiveClassName: duplicate tokens in base are NOT deduped (behaviour lock)", async () => {
      // Confirmed gotcha: `buildActiveClassName(true, "active", "x x")` keeps both "x"
      // tokens from base — it only dedups the active class itself, not duplicates in base.
      render(
        <Link
          routeName="one-more-test"
          className="x x"
          activeClassName="y"
          data-testid="link"
        >
          Test
        </Link>,
        { wrapper },
      );

      await act(async () => {
        await router.navigate("one-more-test");
      });

      // "x x" base preserved verbatim; "y" appended once.
      expect(screen.getByTestId("link").className).toBe("x x y");
    });

    it("buildHref falls back to buildPath when buildUrl returns undefined", () => {
      // `buildUrl` may exist on the router yet return `undefined` for routes
      // that fall outside its URL universe (e.g. unmatched name, no-base
      // configuration). buildHref must not propagate `undefined` to the
      // anchor's `href` — it falls through to `buildPath()` so the link
      // still resolves to a navigable path.
      router.buildUrl = ((): string | undefined =>
        undefined) as Router["buildUrl"];
      const buildPathSpy = vi.spyOn(router, "buildPath");

      render(
        <Link routeName="one-more-test" data-testid="link">
          Test
        </Link>,
        { wrapper },
      );

      expect(buildPathSpy).toHaveBeenCalled();
      expect(screen.getByTestId("link")).toHaveAttribute("href", "/test");
    });

    it("buildActiveClassName: empty activeClassName ('') falls through to base only (no active suffix)", async () => {
      // Locks the branch `isActive && activeClassName` — when activeClassName
      // is an empty string, the active-tokens path is skipped entirely and
      // the base className is returned unchanged, regardless of active state.
      render(
        <Link
          routeName="one-more-test"
          className="base"
          activeClassName=""
          data-testid="link"
        >
          Test
        </Link>,
        { wrapper },
      );

      // Inactive: base preserved.
      expect(screen.getByTestId("link").className).toBe("base");

      await act(async () => {
        await router.navigate("one-more-test");
      });

      // Active: still just "base" — empty activeClassName contributes nothing.
      expect(screen.getByTestId("link").className).toBe("base");
    });
  });

  describe("hash tri-state navigation (#532)", () => {
    it("should call router.navigate without `hash` option when hash prop is undefined (preserve)", async () => {
      const navigateSpy = vi.spyOn(router, "navigate");

      render(
        <Link routeName="one-more-test" data-testid="link">
          Test
        </Link>,
        { wrapper },
      );

      await user.click(screen.getByTestId("link"));

      // navigateWithHash only sets `opts.hash` when the prop is defined;
      // omitting it preserves the browser's current fragment (tri-state).
      const call = navigateSpy.mock.calls.find(
        ([name]) => name === "one-more-test",
      );

      expect(call).toBeDefined();

      const opts = call?.[2] as Record<string, unknown> | undefined;

      expect(opts?.hash).toBeUndefined();
    });

    it("should call router.navigate with `hash: ''` when hash prop is empty (clear)", async () => {
      const navigateSpy = vi.spyOn(router, "navigate");

      render(
        <Link routeName="one-more-test" hash="" data-testid="link">
          Test
        </Link>,
        { wrapper },
      );

      await user.click(screen.getByTestId("link"));

      const call = navigateSpy.mock.calls.find(
        ([name]) => name === "one-more-test",
      );

      expect(call).toBeDefined();

      const opts = call?.[2] as Record<string, unknown> | undefined;

      expect(opts?.hash).toBe("");
    });

    it("should auto-add force + hashChange when navigating same route+params with new hash", async () => {
      // Pre-condition: land on the destination route with hash="a" so the
      // next click is a same-route+params navigation that only differs in
      // hash — exactly the SAME_STATES bypass case navigateWithHash handles.
      await act(async () => {
        await router.navigate("one-more-test", {}, { hash: "a" });
      });

      const navigateSpy = vi.spyOn(router, "navigate");

      render(
        <Link routeName="one-more-test" hash="b" data-testid="link">
          Test
        </Link>,
        { wrapper },
      );

      await user.click(screen.getByTestId("link"));

      const call = navigateSpy.mock.calls.find(
        ([name]) => name === "one-more-test",
      );

      expect(call).toBeDefined();

      const opts = call?.[2] as Record<string, unknown> | undefined;

      expect(opts?.hash).toBe("b");
      expect(opts?.force).toBe(true);
      expect(opts?.hashChange).toBe(true);
    });

    it("should make active state hash-aware when hash prop is set (tab-style UI)", async () => {
      // Two Links share the same routeName but differ in `hash`. Navigate to
      // the route with hash="profile" — only the matching link lights up.
      // This validates the hash-aware active source documented in CLAUDE.md.
      render(
        <>
          <Link
            routeName="one-more-test"
            hash="profile"
            activeClassName="active"
            data-testid="link-profile"
          >
            Profile
          </Link>
          <Link
            routeName="one-more-test"
            hash="account"
            activeClassName="active"
            data-testid="link-account"
          >
            Account
          </Link>
        </>,
        { wrapper },
      );

      expect(screen.getByTestId("link-profile")).not.toHaveClass("active");
      expect(screen.getByTestId("link-account")).not.toHaveClass("active");

      await act(async () => {
        await router.navigate("one-more-test", {}, { hash: "profile" });
      });

      expect(screen.getByTestId("link-profile")).toHaveClass("active");
      expect(screen.getByTestId("link-account")).not.toHaveClass("active");
    });
  });

  describe("no-params active-route source dedup (#776)", () => {
    it("a no-params <Link> shares the canonical undefined-params source (cache key '', not '{}')", () => {
      // A no-params `<Link routeName="users">` and a manual `useIsActiveRoute("users")`
      // (params === undefined) ask ONE logical question and must resolve the SAME
      // cached active-route source — one router subscription, not two (#766).
      // `createActiveRouteSource` keys params as
      // `params === undefined ? "" : canonicalJson(params)`, so defaulting routeParams
      // to EMPTY_PARAMS ({}) before the call keys "{}" and splits the source.
      //
      // Discriminator: a cache HIT returns the shared source without re-running
      // `router.isActiveRoute`; a cache MISS constructs a fresh source and calls it
      // once for its initial value.
      // #1249 re-target: the default-options fast path no longer builds a
      // `createActiveRouteSource` (it uses the shared name-selector), so this
      // #776 undefined-vs-"{}" dedup guard now exercises the SLOW path via
      // `ignoreQueryParams={false}` — which still passes `routeParams` straight
      // through as `undefined` (keying "", not "{}").
      render(
        <Link routeName="users" ignoreQueryParams={false} data-testid="link">
          Users
        </Link>,
        { wrapper },
      );

      const isActiveRouteSpy = vi.spyOn(router, "isActiveRoute");

      createActiveRouteSource(router, "users", undefined, {
        strict: false,
        ignoreQueryParams: false,
      });

      expect(isActiveRouteSpy).not.toHaveBeenCalled();
    });
  });
});
