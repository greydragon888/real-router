import { createRouter } from "@real-router/core";
import { render, screen } from "@solidjs/testing-library";
import { fireEvent } from "@testing-library/dom";
import { userEvent } from "@testing-library/user-event";
import { createSignal, Show } from "solid-js";
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

    const link = screen.getByTestId("link");

    expect(link).toHaveTextContent("Test");
    expect(link).toHaveAttribute("href", "/test");
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

    // Documents gotcha #10 "activeStrict Meaning" from packages/solid/CLAUDE.md:
    //   activeStrict=true requires an EXACT match — an ancestor route must not
    //   activate the link. This is the negative counterpart to the
    //   activeStrict=false test above.
    it("activeStrict=true on ancestor route — Link is NOT active (gotcha #10)", async () => {
      await router.navigate("items.item", { id: 6 });

      render(
        () => (
          <Link
            routeName="items"
            activeStrict
            activeClassName="active"
            data-testid="link"
          >
            Items
          </Link>
        ),
        { wrapper },
      );

      // Current route is items.item, Link points to "items" with activeStrict.
      // Not an exact match, so no active class.
      expect(screen.getByTestId("link")).not.toHaveClass("active");
    });
  });

  describe("clickHandler", () => {
    it("should call onClick callback with the click event", async () => {
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

      expect(onClickMock).toHaveBeenCalledTimes(1);
      expect(onClickMock).toHaveBeenCalledWith(expect.any(MouseEvent));
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

    // shouldNavigate() must bail out on every modifier key. Previously only
    // ctrlKey was covered; this parameterised test covers meta/alt/shift too
    // so a regression in any one modifier is caught.
    it.each([
      { name: "metaKey", props: { metaKey: true } },
      { name: "altKey", props: { altKey: true } },
      { name: "shiftKey", props: { shiftKey: true } },
      { name: "ctrlKey", props: { ctrlKey: true } },
    ])("should not navigate with $name modifier", ({ props: modifiers }) => {
      vi.spyOn(router, "navigate");

      render(
        () => (
          <Link routeName="one-more-test" data-testid="link">
            Test
          </Link>
        ),
        { wrapper },
      );

      fireEvent.click(screen.getByTestId("link"), modifiers);

      expect(router.navigate).not.toHaveBeenCalled();
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

    expect(screen.getByTestId("link")).not.toHaveAttribute("href");
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining("@@nonexistent-route"),
    );

    consoleError.mockRestore();
  });

  it("should throw when used outside RouterProvider", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    expect(() => render(() => <Link routeName="home">Home</Link>)).toThrow(
      "Link must be used within a RouterProvider",
    );

    consoleError.mockRestore();
  });

  // Documents gotcha #2 "Never Destructure Props" from packages/solid/CLAUDE.md:
  //   Solid props are getters. Destructuring them breaks reactivity.
  //   A wrapper that destructures will see only the INITIAL routeName and
  //   will not update when the parent flips the signal.
  it("props: destructured wrapper loses reactivity (gotcha #2)", async () => {
    function DestructuredWrapper({
      routeName,
    }: Readonly<{ routeName: string }>) {
      return (
        <Link routeName={routeName} data-testid="link">
          Link
        </Link>
      );
    }

    const [name, setName] = createSignal("home");

    render(() => <DestructuredWrapper routeName={name()} />, { wrapper });

    expect(screen.getByTestId("link")).toHaveAttribute("href", "/home");

    setName("about");

    // Destructured props are non-reactive — href stays at the initial value.
    expect(screen.getByTestId("link")).toHaveAttribute("href", "/home");
  });

  it("props: getter-based wrapper preserves reactivity (gotcha #2 correct pattern)", async () => {
    function GetterWrapper(props: Readonly<{ routeName: string }>) {
      return (
        <Link routeName={props.routeName} data-testid="link">
          Link
        </Link>
      );
    }

    const [name, setName] = createSignal("home");

    render(() => <GetterWrapper routeName={name()} />, { wrapper });

    expect(screen.getByTestId("link")).toHaveAttribute("href", "/home");

    setName("about");

    // Reading via props.routeName keeps the reactive chain intact.
    expect(screen.getByTestId("link")).toHaveAttribute("href", "/about");
  });

  // Documents gotcha #12 "Link Props Are Captured at Init (Slow Path)" from
  // packages/solid/CLAUDE.md:
  //   Link's slow-path isActive subscription (createActiveRouteSource) captures
  //   routeName, routeParams, activeStrict, ignoreQueryParams at init time —
  //   they are not reactive. Dynamic changes to these props do NOT update the
  //   active class. Workaround: remount the Link (e.g. via conditional render).
  it("slow-path props are captured at init — dynamic activeStrict change has no effect", async () => {
    // Pass routeParams={{}} (new object !== EMPTY_PARAMS singleton) to force
    // slow path. Without this, Link uses fast path via createSelector.
    const slowPathParams = {};
    const [strict, setStrict] = createSignal(false);
    const [showLink, setShowLink] = createSignal(true);

    await router.navigate("items.item", { id: 6 });

    render(
      () => (
        <Show when={showLink()}>
          <Link
            routeName="items"
            routeParams={slowPathParams}
            activeStrict={strict()}
            data-testid="link"
          >
            Test
          </Link>
        </Show>
      ),
      { wrapper },
    );

    // activeStrict=false on slow path — "items" matches ancestor of "items.item"
    expect(screen.getByTestId("link")).toHaveClass("active");

    // Flip to strict: with activeStrict=true, "items" should NOT be active
    // because current route is "items.item" (not strictly equal). But because
    // props are captured at init, the class remains active.
    setStrict(true);

    expect(screen.getByTestId("link")).toHaveClass("active");

    // Workaround from gotcha: force remount by unmount+mount.
    setShowLink(false);
    setShowLink(true);

    // After remount, the new Link instance captures strict=true at init.
    // "items" is NOT strictly equal to "items.item" — no active class.
    expect(screen.getByTestId("link")).not.toHaveClass("active");
  });

  // Documents gotcha #13 "useFastPath Decision Captured at Init" from
  // packages/solid/CLAUDE.md:
  //   The useFastPath decision is also captured at init — changing
  //   activeStrict/ignoreQueryParams/routeParams mid-session does NOT switch
  //   fast↔slow path. The Link stays on whichever path it chose on first render.
  //
  // Verified through observable behavior: a Link mounted on the fast path
  // (EMPTY_PARAMS, default ignoreQueryParams, activeStrict=false) keeps the
  // ancestor-activation behavior of the fast path even after a parent flips
  // activeStrict=true. If the path had actually switched, we would see the
  // activeStrict=true behavior — no active class on ancestor match — matching
  // gotcha #12. It doesn't, because the decision is frozen.
  it("fast↔slow path decision is frozen at init (gotcha #13)", async () => {
    const [strict, setStrict] = createSignal(false);

    await router.navigate("items.item", { id: 6 });

    render(
      () => (
        <Link
          routeName="items"
          activeStrict={strict()}
          activeClassName="active"
          data-testid="link"
        >
          Items
        </Link>
      ),
      { wrapper },
    );

    // Fast path chose at init: ancestor "items" is active.
    expect(screen.getByTestId("link")).toHaveClass("active");

    // Flip strict — if path-switching worked, the ancestor would now be
    // inactive. If the decision is captured at init (expected), fast-path
    // behavior persists and the ancestor stays active.
    setStrict(true);

    expect(screen.getByTestId("link")).toHaveClass("active");
  });
});
