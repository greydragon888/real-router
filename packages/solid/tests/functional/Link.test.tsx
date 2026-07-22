import { createRouter } from "@real-router/core";
import { createActiveRouteSource } from "@real-router/sources";
import { render, screen } from "@solidjs/testing-library";
import { fireEvent } from "@testing-library/dom";
import { userEvent } from "@testing-library/user-event";
import { createSignal, Show } from "solid-js";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { Link, RouterProvider } from "@real-router/solid";

import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router, State } from "@real-router/core";
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
    it("should set active class when the current router state matches the link route name", async () => {
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

      expect(router.getState()?.name).toBe("test");
      expect(screen.getByTestId("link")).not.toHaveClass("active");

      await user.click(screen.getByTestId("link"));

      expect(router.getState()?.name).toStrictEqual(linkRouteName);
      expect(screen.getByTestId("link")).toHaveClass("active");
    });

    it("empty routeName is inactive on an unstarted router — agrees with router.isActiveRoute('') (#1427)", () => {
      // #1427 — an empty routeName is a misuse (matches no route); the canonical
      // answer is router.isActiveRoute("") === false. Solid's Link fast path went
      // through the routeSelector, whose unstarted sentinel (route?.name ?? "")
      // makes isRouteActive("", "") === true → a misused empty-name Link lit up
      // before router.start(). The routeName !== "" guard in useFastPath routes an
      // empty name to the slow createActiveRouteSource (reads router.isActiveRoute("")).
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const unstarted = createTestRouterWithADefaultRouter();

      // NOT started — no active route → the sentinel coerces the current name to "".
      expect(unstarted.isActiveRoute("")).toBe(false);

      render(() => (
        <RouterProvider router={unstarted}>
          <Link routeName="" activeClassName="active" data-testid="empty-link">
            Empty
          </Link>
        </RouterProvider>
      ));

      expect(screen.getByTestId("empty-link")).not.toHaveClass("active");

      errorSpy.mockRestore();
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

      expect(router.getState()?.name).toBe("test");
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

      // audit-2026-05-17 §1 MEDIUM #1 — strict call count + MouseEvent arg
      expect(onClickMock).toHaveBeenCalledTimes(1);
      expect(onClickMock).toHaveBeenCalledWith(expect.any(MouseEvent));

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

      // audit-2026-05-17 §1 MEDIUM #2 — strict call count + MouseEvent arg
      expect(onClickMock).toHaveBeenCalledTimes(1);
      expect(onClickMock).toHaveBeenCalledWith(expect.any(MouseEvent));

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
    vi.spyOn(router, "navigate").mockResolvedValue({} as unknown as State);

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

    // audit-2026-05-17 §1 MEDIUM #4 — pin exact arg shape, not just any-Object
    expect(router.navigate).toHaveBeenCalledWith(
      "one-more-test",
      {},
      undefined,
      {},
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
    // audit-2026-05-17 §1 MEDIUM #3 — pin the exact "is not defined" message
    // and lock that only ONE error was emitted (a regression that double-logs
    // would silently inflate noise).
    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringMatching(
        /^\[real-router\] Route "@@nonexistent-route" is not defined\./,
      ),
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

    // Flip strict to true. If the fast→slow switch happened, strict=true
    // would suppress ancestor activation and the class would be removed.
    // The signal fires, but the path decision is frozen — Link stays on
    // fast path, ancestor stays active. (No tautological strict()===true
    // check — solid-js setSignal contract is not under test here.)
    setStrict(true);

    expect(screen.getByTestId("link")).toHaveClass("active");
  });

  describe("buildHref edge cases", () => {
    it("combines hash and query params in href (#3.1 defensive)", () => {
      render(
        () => (
          <Link
            routeName="items.item"
            routeParams={{ id: "42", q: "search" }}
            hash="section-2"
            data-testid="link"
          >
            Combined
          </Link>
        ),
        { wrapper },
      );

      const href = screen.getByTestId("link").getAttribute("href");

      expect(href).not.toBeNull();
      // Both query and fragment must end up in the rendered href.
      expect(href).toContain("/items/42");
      expect(href).toContain("?q=search"); // explicit `?` lead — substring
      // "q=search" alone could match e.g. ".q=search" without the marker.
      expect(href).toContain("#section-2");
      // Sprint C.1 — pre-conditions for the ordering check: indexOf
      // returns -1 for missing characters, and `-1 > -1` is false, so
      // the assertion below works ONLY because both characters exist.
      // Explicit pin removes the silent failure mode.
      expect(href).toMatch(/\?/);
      expect(href).toMatch(/#/);
      // Query precedes fragment per RFC 3986.
      expect(href!.indexOf("#")).toBeGreaterThan(href!.indexOf("?"));
    });

    it("encodes Unicode params via percent-encoding (#3.2 defensive)", () => {
      render(
        () => (
          <Link
            routeName="items.item"
            routeParams={{ id: "café-🚀-Привет" }}
            data-testid="link"
          >
            Unicode
          </Link>
        ),
        { wrapper },
      );

      const href = screen.getByTestId("link").getAttribute("href");

      expect(href).not.toBeNull();
      // Decoded round-trip must equal the original — verifies the encoder
      // produced valid UTF-8 percent-encoding (multi-byte chars + surrogate
      // pairs for emoji + non-Latin Cyrillic). startsWith() in the matcher
      // is UTF-16-safe but the URL-side encoding has to round-trip.
      expect(decodeURIComponent(href!)).toContain("café-🚀-Привет");
    });

    // Locks the tristate contract from CLAUDE.md "<Link hash> Prop (#532)":
    //   undefined → preserves current state.context.url.hash on click
    //   ""        → clears the hash (opts.hash === "")
    //   "value"   → sets the hash; same-route + diff hash → force + hashChange
    //
    // The spy on router.navigate is the source of truth — navigateWithHash
    // (shared/dom-utils) flows opts through router.navigate verbatim.
    describe("`hash` prop tristate (#532, gotcha #16)", () => {
      it("hash={undefined} → click does not add `hash` key to opts", async () => {
        const spy = vi.spyOn(router, "navigate");

        render(
          () => (
            <Link routeName="about" data-testid="link">
              About
            </Link>
          ),
          { wrapper },
        );

        await user.click(screen.getByTestId("link"));

        expect(spy).toHaveBeenCalledTimes(1);

        // opts must be defined — Link always forwards a third argument so the
        // routing layer sees an explicit options object (no implicit defaults).
        expect(spy.mock.calls[0][3]).toBeDefined();

        const opts = spy.mock.calls[0][3]!;

        // Undefined hash MUST stay undefined — no `hash` key in opts.
        expect("hash" in opts).toBe(false);
        expect((opts as { force?: boolean }).force).toBeUndefined();
      });

      it("hash='' → click forwards opts.hash === '' verbatim", async () => {
        const spy = vi.spyOn(router, "navigate");

        render(
          () => (
            <Link routeName="about" hash="" data-testid="link">
              About
            </Link>
          ),
          { wrapper },
        );

        await user.click(screen.getByTestId("link"));

        expect(spy).toHaveBeenCalledTimes(1);

        expect(spy.mock.calls[0][3]).toBeDefined();

        const opts = spy.mock.calls[0][3]!;

        expect(opts.hash).toBe("");
        // Cross-route navigation → no force/hashChange auto-bypass.
        expect((opts as { force?: boolean }).force).toBeUndefined();
        expect((opts as { hashChange?: boolean }).hashChange).toBeUndefined();
      });

      it("hash='value' on a different route → opts.hash forwarded, no force/hashChange", async () => {
        const spy = vi.spyOn(router, "navigate");

        render(
          () => (
            <Link routeName="about" hash="section" data-testid="link">
              About
            </Link>
          ),
          { wrapper },
        );

        await user.click(screen.getByTestId("link"));

        expect(spy).toHaveBeenCalledTimes(1);

        expect(spy.mock.calls[0][3]).toBeDefined();

        const opts = spy.mock.calls[0][3]!;

        expect(opts.hash).toBe("section");
        // Cross-route — same-route hash logic must NOT fire.
        expect((opts as { force?: boolean }).force).toBeUndefined();
        expect((opts as { hashChange?: boolean }).hashChange).toBeUndefined();
      });

      it("hash='value' on same route + different current hash → auto-adds force + hashChange (SAME_STATES bypass)", async () => {
        // Navigate first to a route with hash A so state.context.url.hash
        // is populated. Then click a Link targeting the same route + same
        // params but with hash B — navigateWithHash must auto-bypass core's
        // SAME_STATES rejection by setting `force: true, hashChange: true`.
        await router.navigate("about", {}, undefined, { hash: "first" });

        const spy = vi.spyOn(router, "navigate");

        render(
          () => (
            <Link routeName="about" hash="second" data-testid="link">
              About
            </Link>
          ),
          { wrapper },
        );

        await user.click(screen.getByTestId("link"));

        expect(spy).toHaveBeenCalledTimes(1);

        expect(spy.mock.calls[0][3]).toBeDefined();

        const opts = spy.mock.calls[0][3]!;

        expect(opts.hash).toBe("second");
        expect((opts as { force?: boolean }).force).toBe(true);
        expect((opts as { hashChange?: boolean }).hashChange).toBe(true);
      });

      it("hash='value' on same route + same current hash → no force/hashChange (no spurious SAME_STATES bypass)", async () => {
        // Symmetric to the previous test — when the requested hash equals
        // the current hash, navigateWithHash must NOT add force/hashChange.
        // Adding them would force a redundant transition where SAME_STATES
        // correctly rejects.
        await router.navigate("about", {}, undefined, { hash: "same" });

        const spy = vi.spyOn(router, "navigate");

        render(
          () => (
            <Link routeName="about" hash="same" data-testid="link">
              About
            </Link>
          ),
          { wrapper },
        );

        // Click is expected to be rejected by core's SAME_STATES — Link
        // swallows the rejection with .catch(() => {}). Use fireEvent
        // (sync) to avoid awaiting the rejection.
        fireEvent.click(screen.getByTestId("link"));

        expect(spy).toHaveBeenCalledTimes(1);

        expect(spy.mock.calls[0][3]).toBeDefined();

        const opts = spy.mock.calls[0][3]!;

        expect(opts.hash).toBe("same");
        expect((opts as { force?: boolean }).force).toBeUndefined();
        expect((opts as { hashChange?: boolean }).hashChange).toBeUndefined();
      });
    });

    // Probes how real-router stringifies exotic JS value types when they
    // sneak into `routeParams`. These types are NOT supported as first-class
    // route param values — but property-test fuzzing or stale state can
    // produce them, and `buildHref` MUST not throw. Lock the observed
    // behavior here so a future buildPath refactor doesn't silently break
    // the no-crash contract.
    describe("exotic param types — defensive (§5.2)", () => {
      it("BigInt → stringified via toString (1n → '1'), no crash", () => {
        render(
          () => (
            <Link
              routeName="items.item"
              routeParams={{ id: 1n as unknown as string }}
              data-testid="link"
            >
              BigInt
            </Link>
          ),
          { wrapper },
        );

        const href = screen.getByTestId("link").getAttribute("href");

        expect(href).not.toBeNull();
        expect(href).toContain("/items/1");
      });

      it("Symbol → stringified via toString ('Symbol(x)'), no crash", () => {
        render(
          () => (
            <Link
              routeName="items.item"
              routeParams={{
                id: Symbol("x") as unknown as string,
              }}
              data-testid="link"
            >
              Symbol
            </Link>
          ),
          { wrapper },
        );

        const href = screen.getByTestId("link").getAttribute("href");

        expect(href).not.toBeNull();
        // Symbol's toString is "Symbol(x)" — URL-encoded for the path slot.
        expect(decodeURIComponent(href!)).toContain("/items/Symbol(x)");
      });

      it("Date → JSON-stringified ISO + URL-encoded, no crash", () => {
        const date = new Date("2026-05-13T00:00:00.000Z");

        render(
          () => (
            <Link
              routeName="items.item"
              routeParams={{ id: date as unknown as string }}
              data-testid="link"
            >
              Date
            </Link>
          ),
          { wrapper },
        );

        const href = screen.getByTestId("link").getAttribute("href");

        expect(href).not.toBeNull();
        expect(decodeURIComponent(href!)).toContain("/items/");

        // audit-2026-05-17 §1 MEDIUM #7 — assert the post-slug payload is
        // non-empty AND looks like a date serialisation. `String(date)`
        // (Date.prototype.toString — `Mon Jan 01 2024 ...`), `date.toISOString()`
        // (`2024-01-01T00:00:00.000Z`), and `date.valueOf()` (epoch ms) all
        // contain a 4-digit year — that's the cross-format invariant.
        // The previous `length > "/items/".length` would have accepted any
        // single char appended (including `"/"` → empty slug).
        const slug = decodeURIComponent(href!).slice("/items/".length);

        expect(slug.length).toBeGreaterThan(0);
        expect(slug).toMatch(/\d{4}/);
      });

      it("Map → empty-object JSON ('{}'), no crash", () => {
        render(
          () => (
            <Link
              routeName="items.item"
              routeParams={{ id: new Map() as unknown as string }}
              data-testid="link"
            >
              Map
            </Link>
          ),
          { wrapper },
        );

        const href = screen.getByTestId("link").getAttribute("href");

        expect(href).not.toBeNull();
        // `JSON.stringify(new Map()) === "{}"` — Map has no enumerable
        // own keys for the JSON serializer.
        expect(decodeURIComponent(href!)).toContain("/items/{}");
      });

      it("Set → empty-object JSON ('{}'), no crash", () => {
        render(
          () => (
            <Link
              routeName="items.item"
              routeParams={{ id: new Set([1, 2]) as unknown as string }}
              data-testid="link"
            >
              Set
            </Link>
          ),
          { wrapper },
        );

        const href = screen.getByTestId("link").getAttribute("href");

        expect(href).not.toBeNull();
        // `JSON.stringify(new Set([1,2])) === "{}"` — same as Map.
        expect(decodeURIComponent(href!)).toContain("/items/{}");
      });
    });

    it("serializes numeric params correctly (#3.3 defensive)", async () => {
      render(
        () => (
          <Link
            routeName="items.item"
            routeParams={{ id: 6 }}
            data-testid="link"
          >
            Numeric
          </Link>
        ),
        { wrapper },
      );

      const href = screen.getByTestId("link").getAttribute("href");

      expect(href).not.toBeNull();
      // Number must end up as a percent-safe ASCII string in the URL.
      expect(href).toContain("/items/6");

      // And the navigation must round-trip (number is stored as such in
      // params, but URL serialization is the string "6").
      await router.navigate("items.item", { id: 6 });

      expect(router.getState()?.params).toStrictEqual({ id: 6 });
    });
  });

  describe("no-params active-route source dedup (#776)", () => {
    it("a no-params slow-path <Link> shares the canonical undefined-params source (cache key '', not '{}')", () => {
      // Solid's <Link> takes the O(1) routeSelector fast path for default options +
      // no params, so the cache-key split only bites the SLOW path. `activeStrict`
      // forces the slow path WITHOUT params: the source must be built with `undefined`
      // (key ""), shared with a manual createActiveRouteSource(router, name, undefined,
      // { strict: true }) — NOT local.routeParams === EMPTY_PARAMS ({}) which keys "{}"
      // and splits the same question into a second eager subscription (#776).
      //
      // Discriminator: a cache HIT returns the shared source without re-running
      // router.isActiveRoute; a cache MISS constructs a fresh source and calls it once.
      render(
        () => (
          <Link routeName="users" activeStrict data-testid="link">
            Users
          </Link>
        ),
        { wrapper },
      );

      const isActiveRouteSpy = vi.spyOn(router, "isActiveRoute");

      createActiveRouteSource(router, "users", undefined, undefined, {
        strict: true,
        ignoreQueryParams: true,
      });

      expect(isActiveRouteSpy).not.toHaveBeenCalled();
    });
  });
});
