import { createRouter } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";
import { createActiveRouteSource } from "@real-router/sources";
import { screen, render, act, fireEvent } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { Link, RouterProvider } from "@real-router/react";

import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router } from "@real-router/core";
import type { MouseEvent, ReactNode } from "react";

describe("Link component", () => {
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

  it("should render component, href and children correctly", () => {
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

      await act(() =>
        router.navigate(linkRouteName, {
          ...linkRouteParams,
          a: "b",
          c: "d",
        }),
      );

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

      await act(() =>
        router.navigate(linkRouteName, {
          ...linkRouteParams,
          e: "f",
          g: "h",
        }),
      );

      expect(screen.getByTestId("link")).not.toHaveClass("active");
    });

    it("should re-render when routeParams contain different non-serializable values (BigInt)", () => {
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      // BigInt is intentionally incompatible with Record<string,string> — the double
      // cast is required to exercise shallowEqual's Object.is path: Object.is(1n, 2n) === false.
      const bigintParams1 = { id: 1n } as unknown as Record<string, string>;
      const bigintParams2 = { id: 2n } as unknown as Record<string, string>;

      const { rerender } = render(
        <Link
          routeName="items.item"
          routeParams={bigintParams1}
          activeClassName="active"
          data-testid="link"
        >
          Test
        </Link>,
        { wrapper },
      );

      const link = screen.getByTestId("link");

      // BigInt coerces to string in URI encoding: {id: 1n} → "/items/1"
      expect(link).toHaveAttribute("href", "/items/1");

      // Different BigInt values → Object.is(1n, 2n) === false → areLinkPropsEqual returns false → re-render.
      rerender(
        <Link
          routeName="items.item"
          routeParams={bigintParams2}
          activeClassName="active"
          data-testid="link"
        >
          Test
        </Link>,
      );

      // Href changed to /items/2, proving Link re-rendered with new params.
      expect(link).toHaveAttribute("href", "/items/2");

      consoleError.mockRestore();
    });

    it("should re-render when routeParams toggles between undefined and defined", () => {
      const { rerender } = render(
        <Link
          routeName="items.item"
          activeClassName="active"
          data-testid="link"
        >
          Test
        </Link>,
        { wrapper },
      );

      const link = screen.getByTestId("link");

      // No params → buildPath("items.item", undefined) fails (required :id missing) → no href.
      expect(link.getAttribute("href")).toBeNull();

      // undefined → defined: shallowEqual hits `!a || !b` branch → false → re-render.
      rerender(
        <Link
          routeName="items.item"
          routeParams={{ id: "7" }}
          activeClassName="active"
          data-testid="link"
        >
          Test
        </Link>,
      );

      // Href present, proving Link re-rendered with defined params.
      expect(link).toHaveAttribute("href", "/items/7");

      // defined → undefined: same asymmetric branch on the other side.
      rerender(
        <Link
          routeName="items.item"
          activeClassName="active"
          data-testid="link"
        >
          Test
        </Link>,
      );

      // Href gone again, proving Link re-rendered with undefined params.
      expect(link.getAttribute("href")).toBeNull();
    });

    it("should re-render when routeParams contain Symbol/Date/Map/nested-object values with different references", () => {
      // Covers CLAUDE.md L388-394 gotcha: shallowEqual uses Object.is per key,
      // so Symbol / Date / Map / nested-object values that look "the same"
      // structurally but are different references do NOT bail out memo().
      // Observable: `router.buildPath` is called from `buildHref` on every Link
      // render (no useMemo since §8.2). A rerender with a different-ref params
      // bumps the call count; a bail-out would keep it flat.
      const buildPathSpy = vi.spyOn(router, "buildPath");
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const cases: { name: string; refA: unknown; refB: unknown }[] = [
        // Symbols are unique per construction — same description, different identity.
        { name: "Symbol", refA: Symbol("x"), refB: Symbol("x") },
        // Distinct Date instances even when they encode the same epoch.
        {
          name: "Date",
          refA: new Date(2026, 0, 1),
          refB: new Date(2026, 0, 1),
        },
        // Distinct Map instances with identical entries.
        {
          name: "Map",
          refA: new Map([["k", "v"]]),
          refB: new Map([["k", "v"]]),
        },
        // Nested objects — CLAUDE.md L391-394 explicitly calls out "different
        // refs → re-render". Consumers stabilize via useMemo if needed.
        {
          name: "nested object",
          refA: { filters: [1, 2] },
          refB: { filters: [1, 2] },
        },
      ];

      const { rerender } = render(
        <Link
          routeName="items.item"
          routeParams={
            { id: "1", n: cases[0].refA } as unknown as Record<string, string>
          }
          data-testid="link"
        >
          Test
        </Link>,
        { wrapper },
      );

      for (const { name, refA, refB } of cases) {
        // First, rerender with the "A" reference to establish a baseline
        // (covers all four cases on the same Link instance).
        rerender(
          <Link
            routeName="items.item"
            routeParams={
              { id: "1", n: refA } as unknown as Record<string, string>
            }
            data-testid="link"
          >
            Test
          </Link>,
        );

        const callsBefore = buildPathSpy.mock.calls.length;

        // Rerender with the "B" reference — same structural content, different identity.
        rerender(
          <Link
            routeName="items.item"
            routeParams={
              { id: "1", n: refB } as unknown as Record<string, string>
            }
            data-testid="link"
          >
            Test
          </Link>,
        );

        expect(
          buildPathSpy.mock.calls.length,
          `memo() must NOT bail out for ${name} value identity change`,
        ).toBeGreaterThan(callsBefore);
      }

      consoleError.mockRestore();
    });

    it("should default ignoreQueryParams=true when prop omitted (gotcha)", async () => {
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

      // Navigate with extra query params — default behavior ignores them.
      await act(() =>
        router.navigate(linkRouteName, {
          ...linkRouteParams,
          page: "2",
        }),
      );

      expect(screen.getByTestId("link")).toHaveClass("active");
    });

    it("should add active class based on activeStrict", async () => {
      const activeClassName = "active";
      const parentRouteName = "items";
      const childRouteName = "items.item";
      const childRouteParams = { id: 6 };

      await act(() => router.navigate(childRouteName, childRouteParams));

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

      await act(() => router.navigate(childRouteName, childRouteParams));

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

      // Middle click
      fireEvent.click(screen.getByTestId("link"), { button: 1 });

      expect(onClickMock).toHaveBeenCalledTimes(1);

      expect(router.navigate).not.toHaveBeenCalled();
      expect(router.getState()?.name).toStrictEqual(currentRouteName);

      vi.clearAllMocks();

      // Click with modifier keys
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
        <Link routeName="users" data-testid="link">
          Users
        </Link>,
        { wrapper: wrapperWithoutBuildUrl },
      );

      // Without buildUrl, Link falls back to buildPath
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
      vi.spyOn(router, "navigate").mockResolvedValue(router.getState()!);

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
        {},
        undefined,
        { replace: true },
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
        {},
        undefined,
        { reload: true },
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

  describe("navigation to blocked route", () => {
    it("should not throw unhandled rejection when navigating to blocked route", async () => {
      const lifecycle = getLifecycleApi(router);
      const guard = vi.fn(() => () => false);

      lifecycle.addActivateGuard("home", guard);

      const unhandledRejection = vi.fn();

      globalThis.addEventListener("unhandledrejection", unhandledRejection);

      const initialState = router.getState();

      render(
        <Link routeName="home" data-testid="link">
          Go Home
        </Link>,
        { wrapper },
      );

      fireEvent.click(screen.getByTestId("link"));

      // Give time for any unhandled rejection to surface
      await act(async () => {
        await new Promise((resolve) => {
          setTimeout(resolve, 50);
        });
      });

      expect(unhandledRejection).not.toHaveBeenCalled();
      expect(guard).toHaveBeenCalled();
      expect(router.getState()?.name).toBe(initialState?.name);

      globalThis.removeEventListener("unhandledrejection", unhandledRejection);
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
      expect.stringMatching(/@@nonexistent-route/),
    );

    consoleError.mockRestore();
  });

  describe("hash prop tri-state (#532)", () => {
    it("hash={undefined} calls navigate without hash option (preserves current hash)", async () => {
      vi.spyOn(router, "navigate");

      render(
        <Link routeName="one-more-test" data-testid="link">
          Test
        </Link>,
        { wrapper },
      );

      await user.click(screen.getByTestId("link"));

      expect(router.navigate).toHaveBeenCalledWith(
        "one-more-test",
        {},
        undefined,
        {},
      );
    });

    it('hash="" calls navigate with hash: "" (clears hash)', async () => {
      vi.spyOn(router, "navigate");

      render(
        <Link routeName="one-more-test" hash="" data-testid="link">
          Test
        </Link>,
        { wrapper },
      );

      await user.click(screen.getByTestId("link"));

      expect(router.navigate).toHaveBeenCalledWith(
        "one-more-test",
        {},
        undefined,
        {
          hash: "",
        },
      );
    });

    it('hash="section" on same route adds force + hashChange (bypasses SAME_STATES)', async () => {
      vi.spyOn(router, "navigate");

      // router already started at "/" = "test" route in beforeEach
      render(
        <Link routeName="test" hash="section" data-testid="link">
          Test
        </Link>,
        { wrapper },
      );

      await user.click(screen.getByTestId("link"));

      expect(router.navigate).toHaveBeenCalledWith("test", {}, undefined, {
        hash: "section",
        force: true,
        hashChange: true,
      });
    });
  });

  describe("no-params active-route source dedup (#776)", () => {
    it("a no-params <Link> shares the canonical undefined-params source (cache key '', not '{}')", () => {
      // A no-params `<Link routeName="users">` and a manual `useIsActiveRoute("users")`
      // (params === undefined) ask ONE logical question — they must resolve the SAME
      // cached active-route source so they share a single router subscription (#766),
      // not two. `createActiveRouteSource` keys params as
      // `params === undefined ? "" : canonicalJson(params)`, so defaulting routeParams
      // to EMPTY_PARAMS ({}) before the call keys "{}", splitting from the canonical
      // undefined key "".
      //
      // Discriminator (no module spying, timing-robust): a cache HIT returns the shared
      // source without re-running `computeActive` → `router.isActiveRoute`; a cache MISS
      // constructs a fresh source and calls `isActiveRoute` exactly once for its initial
      // value. So if the canonical undefined-params lookup is a HIT, the Link already
      // owns that exact instance.
      // #1248 re-target: the default-options fast path no longer builds a
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

      // Exactly what `useIsActiveRoute("users", undefined, false, false)` builds.
      createActiveRouteSource(router, "users", undefined, undefined, {
        strict: false,
        ignoreQueryParams: false,
      });

      // GREEN: the Link created this same "" entry → cache hit → no recompute.
      // RED (bug): the Link created a "{}" entry → this misses → constructs a second
      // source and calls isActiveRoute once.
      expect(isActiveRouteSpy).not.toHaveBeenCalled();
    });
  });
});
