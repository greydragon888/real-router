import { render, screen } from "@solidjs/testing-library";
import { fireEvent } from "@testing-library/dom";
import { userEvent } from "@testing-library/user-event";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

// @ts-expect-error - link is used in JSX directives
// eslint-disable-next-line @typescript-eslint/no-unused-vars, sonarjs/unused-import
import { RouterProvider, link } from "@real-router/solid";

import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router } from "@real-router/core";
import type { JSX } from "solid-js";

describe("link directive", () => {
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

  describe("href attribute", () => {
    it("should set href on <a> elements", () => {
      render(
        () => (
          <a use:link={{ routeName: "one-more-test" }} data-testid="link">
            Test
          </a>
        ),
        { wrapper },
      );

      expect(screen.getByTestId("link")).toHaveAttribute("href", "/test");
    });

    it("should set href with route params", () => {
      render(
        () => (
          <a
            use:link={{
              routeName: "items.item",
              routeParams: { id: "123" },
            }}
            data-testid="link"
          >
            Test
          </a>
        ),
        { wrapper },
      );

      expect(screen.getByTestId("link")).toHaveAttribute("href", "/items/123");
    });

    it("should not set href and log error for invalid routeName", () => {
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      render(
        () => (
          <a use:link={{ routeName: "@@nonexistent-route" }} data-testid="link">
            Test
          </a>
        ),
        { wrapper },
      );

      expect(screen.getByTestId("link")).not.toHaveAttribute("href");
      expect(consoleError).toHaveBeenCalledWith(
        expect.stringContaining("@@nonexistent-route"),
      );

      consoleError.mockRestore();
    });
  });

  describe("a11y attributes", () => {
    it("should add role and tabindex to non-focusable elements", () => {
      render(
        () => (
          <div use:link={{ routeName: "one-more-test" }} data-testid="link">
            Test
          </div>
        ),
        { wrapper },
      );

      const element = screen.getByTestId("link");

      expect(element).toHaveAttribute("role", "link");
      expect(element).toHaveAttribute("tabindex", "0");
    });

    it("should not override existing role attribute", () => {
      render(
        () => (
          <div
            use:link={{ routeName: "one-more-test" }}
            role="button"
            data-testid="link"
          >
            Test
          </div>
        ),
        { wrapper },
      );

      expect(screen.getByTestId("link")).toHaveAttribute("role", "button");
    });

    it("should not override existing tabindex attribute", () => {
      render(
        () => (
          <div
            use:link={{ routeName: "one-more-test" }}
            tabindex={-1}
            data-testid="link"
          >
            Test
          </div>
        ),
        { wrapper },
      );

      expect(screen.getByTestId("link")).toHaveAttribute("tabindex", "-1");
    });

    it("should not add a11y attributes to <a> elements", () => {
      render(
        () => (
          <a use:link={{ routeName: "one-more-test" }} data-testid="link">
            Test
          </a>
        ),
        { wrapper },
      );

      const element = screen.getByTestId("link");

      expect(element).not.toHaveAttribute("role");
    });

    it("should not add a11y attributes to <button> elements", () => {
      render(
        () => (
          <button use:link={{ routeName: "one-more-test" }} data-testid="link">
            Test
          </button>
        ),
        { wrapper },
      );

      const element = screen.getByTestId("link");

      expect(element).not.toHaveAttribute("role");
    });

    // §5.5 anti-pattern lock: `applyLinkA11y` only short-circuits on
    // `HTMLAnchorElement` and `HTMLButtonElement`. Anything else — including
    // `<input>`, `<select>`, `<textarea>`, `<label>` — gets `role="link"` and
    // `tabindex="0"` slapped on, which is semantically WRONG for form
    // controls but a documented consequence of the helper's narrow skip-list.
    //
    // These tests lock the current behavior so an accidental "fix" that
    // adds role/tabindex skipping for form controls (or, worse, removes
    // them from the skip list) doesn't slip through silently. The fix path,
    // if anyone needs it, is to widen `applyLinkA11y`'s short-circuit to
    // cover form controls — but no realistic use case has surfaced yet.
    it("§5.5 anti-pattern — <input> gets role=link + tabindex (documented gotcha)", () => {
      render(
        () => (
          <input use:link={{ routeName: "one-more-test" }} data-testid="link" />
        ),
        { wrapper },
      );

      const element = screen.getByTestId("link");

      // The helper does NOT short-circuit on <input>: role/tabindex are set.
      expect(element).toHaveAttribute("role", "link");
      expect(element).toHaveAttribute("tabindex", "0");
    });

    it("§5.5 anti-pattern — <textarea> gets role=link + tabindex (documented gotcha)", () => {
      render(
        () => (
          <textarea
            use:link={{ routeName: "one-more-test" }}
            data-testid="link"
          />
        ),
        { wrapper },
      );

      const element = screen.getByTestId("link");

      expect(element).toHaveAttribute("role", "link");
      expect(element).toHaveAttribute("tabindex", "0");
    });
  });

  describe("click handler", () => {
    it("should navigate on left click", async () => {
      render(
        () => (
          <a use:link={{ routeName: "one-more-test" }} data-testid="link">
            Test
          </a>
        ),
        { wrapper },
      );

      expect(router.getState()?.name).not.toBe("one-more-test");

      await user.click(screen.getByTestId("link"));

      expect(router.getState()?.name).toBe("one-more-test");
    });

    it("should navigate with route params", async () => {
      render(
        () => (
          <a
            use:link={{
              routeName: "items.item",
              routeParams: { id: "456" },
            }}
            data-testid="link"
          >
            Test
          </a>
        ),
        { wrapper },
      );

      await user.click(screen.getByTestId("link"));

      expect(router.getState()?.name).toStrictEqual("items.item");
      expect(router.getState()?.params).toStrictEqual({ id: "456" });
    });

    it("should not navigate on right click", () => {
      vi.spyOn(router, "navigate");

      render(
        () => (
          <a use:link={{ routeName: "one-more-test" }} data-testid="link">
            Test
          </a>
        ),
        { wrapper },
      );

      fireEvent.click(screen.getByTestId("link"), { button: 1 });

      expect(router.navigate).not.toHaveBeenCalled();
    });

    it("should not navigate with modifier keys", () => {
      vi.spyOn(router, "navigate");

      render(
        () => (
          <a use:link={{ routeName: "one-more-test" }} data-testid="link">
            Test
          </a>
        ),
        { wrapper },
      );

      fireEvent.click(screen.getByTestId("link"), { ctrlKey: true });

      expect(router.navigate).not.toHaveBeenCalled();
    });

    it("should prevent default on <a> elements", async () => {
      const preventDefaultSpy = vi.spyOn(Event.prototype, "preventDefault");

      render(
        () => (
          <a use:link={{ routeName: "one-more-test" }} data-testid="link">
            Test
          </a>
        ),
        { wrapper },
      );

      await user.click(screen.getByTestId("link"));

      expect(preventDefaultSpy).toHaveBeenCalled();

      preventDefaultSpy.mockRestore();
    });

    it("should not prevent default on non-<a> elements", async () => {
      const preventDefaultSpy = vi.spyOn(Event.prototype, "preventDefault");

      render(
        () => (
          <div use:link={{ routeName: "one-more-test" }} data-testid="link">
            Test
          </div>
        ),
        { wrapper },
      );

      await user.click(screen.getByTestId("link"));

      expect(preventDefaultSpy).not.toHaveBeenCalled();

      preventDefaultSpy.mockRestore();
    });
  });

  // The link directive attaches only a click handler — it has no keydown listener.
  // These tests document that keyboard events are not intercepted.
  describe("click-only — no keyboard handler", () => {
    it("does not intercept keyboard events (Space and Enter do not navigate)", () => {
      vi.spyOn(router, "navigate");

      render(
        () => (
          <div use:link={{ routeName: "one-more-test" }} data-testid="link">
            Test
          </div>
        ),
        { wrapper },
      );

      const element = screen.getByTestId("link");

      fireEvent.keyDown(element, { key: "Space" });
      fireEvent.keyDown(element, { key: "Enter" });

      expect(router.navigate).not.toHaveBeenCalled();
    });
  });

  describe("active class", () => {
    it("should add active class when route matches", async () => {
      render(
        () => (
          <a
            use:link={{
              routeName: "one-more-test",
              activeClassName: "active",
            }}
            data-testid="link"
          >
            Test
          </a>
        ),
        { wrapper },
      );

      expect(screen.getByTestId("link")).not.toHaveClass("active");

      await user.click(screen.getByTestId("link"));

      expect(screen.getByTestId("link")).toHaveClass("active");
    });

    it("should remove active class when route changes", async () => {
      await router.navigate("one-more-test");

      render(
        () => (
          <a
            use:link={{
              routeName: "one-more-test",
              activeClassName: "active",
            }}
            data-testid="link"
          >
            Test
          </a>
        ),
        { wrapper },
      );

      expect(screen.getByTestId("link")).toHaveClass("active");

      await router.navigate("home");

      expect(screen.getByTestId("link")).not.toHaveClass("active");
    });

    it("should respect activeStrict option", async () => {
      await router.navigate("items.item", { id: "123" });

      render(
        () => (
          <a
            use:link={{
              routeName: "items",
              activeClassName: "active",
              activeStrict: false,
            }}
            data-testid="link"
          >
            Test
          </a>
        ),
        { wrapper },
      );

      expect(screen.getByTestId("link")).toHaveClass("active");
    });

    it("should not add active class with activeStrict when child route is active", async () => {
      await router.navigate("items.item", { id: "123" });

      render(
        () => (
          <a
            use:link={{
              routeName: "items",
              activeClassName: "active",
              activeStrict: true,
            }}
            data-testid="link"
          >
            Test
          </a>
        ),
        { wrapper },
      );

      expect(screen.getByTestId("link")).not.toHaveClass("active");
    });

    it("should respect ignoreQueryParams option", async () => {
      render(
        () => (
          <a
            use:link={{
              routeName: "items.item",
              routeParams: { id: "123" },
              activeClassName: "active",
              ignoreQueryParams: true,
            }}
            data-testid="link"
          >
            Test
          </a>
        ),
        { wrapper },
      );

      await router.navigate("items.item", { id: "123", page: "2" });

      expect(screen.getByTestId("link")).toHaveClass("active");
    });

    it("should not add active class when ignoreQueryParams is false and query differs", async () => {
      render(
        () => (
          <a
            use:link={{
              routeName: "items.item",
              routeParams: { id: "123" },
              activeClassName: "active",
              ignoreQueryParams: false,
            }}
            data-testid="link"
          >
            Test
          </a>
        ),
        { wrapper },
      );

      await router.navigate("items.item", { id: "123", page: "2" });

      expect(screen.getByTestId("link")).not.toHaveClass("active");
    });

    it("should not add active class when activeClassName is not provided", async () => {
      render(
        () => (
          <a use:link={{ routeName: "one-more-test" }} data-testid="link">
            Test
          </a>
        ),
        { wrapper },
      );

      await user.click(screen.getByTestId("link"));

      const linkElement = screen.getByTestId("link");

      expect(linkElement).not.toHaveClass("active");
      // Stronger: directive must not set ANY class attribute when
      // activeClassName is omitted (catches accidental `class="other"`).
      expect(linkElement.getAttribute("class")).toBeNull();
    });
  });

  describe("route options", () => {
    it("should pass route options to navigate", async () => {
      const navigateSpy = vi.spyOn(router, "navigate");

      render(
        () => (
          <a
            use:link={{
              routeName: "one-more-test",
              routeOptions: { replace: true },
            }}
            data-testid="link"
          >
            Test
          </a>
        ),
        { wrapper },
      );

      await user.click(screen.getByTestId("link"));

      expect(navigateSpy).toHaveBeenCalledWith(
        "one-more-test",
        {},
        { replace: true },
      );
    });
  });

  describe("known limitation: accessor called once at init", () => {
    it("should navigate to initial route even after accessor value changes", async () => {
      vi.spyOn(router, "navigate");

      // The directive calls accessor() once at init. Even if the outer variable
      // changes, the captured options object retains the initial routeName.
      let currentRouteName = "one-more-test";

      render(
        () => (
          <a use:link={{ routeName: currentRouteName }} data-testid="link">
            Test
          </a>
        ),
        { wrapper },
      );

      // Mutate the outer variable after the directive has already captured its value
      currentRouteName = "about";

      await user.click(screen.getByTestId("link"));

      // The directive still navigates to the INITIAL value ("one-more-test"),
      // not the updated value ("about"), because accessor() is called once
      expect(router.navigate).toHaveBeenCalledWith("one-more-test", {}, {});
      expect(router.navigate).not.toHaveBeenCalledWith("about", {}, {});
    });

    it("should keep initial href after accessor value changes", () => {
      let currentRouteName = "one-more-test";

      render(
        () => (
          <a use:link={{ routeName: currentRouteName }} data-testid="link">
            Test
          </a>
        ),
        { wrapper },
      );

      expect(screen.getByTestId("link")).toHaveAttribute("href", "/test");

      // Change the variable — href should NOT update
      currentRouteName = "about";

      // href still reflects the initial value
      expect(screen.getByTestId("link")).toHaveAttribute("href", "/test");
    });
  });

  describe("cleanup", () => {
    it("should remove event listeners on cleanup", () => {
      const { unmount } = render(
        () => (
          <a use:link={{ routeName: "one-more-test" }} data-testid="link">
            Test
          </a>
        ),
        { wrapper },
      );

      const linkElement = screen.getByTestId("link");
      const removeEventListenerSpy = vi.spyOn(
        linkElement,
        "removeEventListener",
      );

      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        "click",
        expect.any(Function),
      );
    });
  });

  // §5.12 audit edge case — directive idempotency / coexistence with a
  // pre-existing consumer click listener on the same element.
  //
  // The directive attaches its handler via `addEventListener("click", ...)`,
  // which is ADDITIVE — it does NOT replace an existing JSX `onClick` (which
  // Solid translates to a property assignment, distinct from the addEventListener
  // queue). So both listeners must fire on click, AND cleanup must only
  // remove the directive's handler, leaving the JSX listener intact.
  describe("idempotency — coexistence with pre-existing click listener (§5.12)", () => {
    it("directive click + JSX onClick on same <a> — both fire, directive navigates", async () => {
      const consumerSpy = vi.fn();
      const navigateSpy = vi.spyOn(router, "navigate");

      render(
        () => (
          <a
            use:link={{ routeName: "one-more-test" }}
            onClick={consumerSpy}
            data-testid="link"
          >
            Test
          </a>
        ),
        { wrapper },
      );

      await user.click(screen.getByTestId("link"));

      // Both the JSX-provided onClick AND the directive's click handler fire.
      // Order is JSX-property handler first (DOM-property handler runs before
      // addEventListener queue), but the assertion below just locks that
      // BOTH ran on a single click.
      expect(consumerSpy).toHaveBeenCalledTimes(1);
      expect(navigateSpy).toHaveBeenCalledWith(
        "one-more-test",
        expect.any(Object),
        expect.any(Object),
      );
    });

    it("after unmount, JSX onClick remains on element while directive listener is removed", async () => {
      const consumerSpy = vi.fn();
      const navigateSpy = vi.spyOn(router, "navigate");

      const { unmount } = render(
        () => (
          <a
            use:link={{ routeName: "one-more-test" }}
            onClick={consumerSpy}
            data-testid="link"
          >
            Test
          </a>
        ),
        { wrapper },
      );

      const linkElement = screen.getByTestId("link");

      // Sanity: directive's handler is currently bound — click triggers nav.
      await user.click(linkElement);

      expect(navigateSpy).toHaveBeenCalledTimes(1);
      expect(consumerSpy).toHaveBeenCalledTimes(1);

      navigateSpy.mockClear();
      consumerSpy.mockClear();

      // The directive's onCleanup runs at unmount. Solid will also unmount
      // the JSX `onClick` because the element itself is removed from the DOM.
      // What the test locks: cleanup did not throw, did not double-call,
      // and the directive's `removeEventListener` ran in isolation from the
      // consumer-supplied handler.
      const removeEventListenerSpy = vi.spyOn(
        linkElement,
        "removeEventListener",
      );

      unmount();

      // Exactly one removeEventListener("click", ...) from the directive —
      // not double-called, not racing with consumer cleanup.
      const clickRemovals = removeEventListenerSpy.mock.calls.filter(
        ([type]) => type === "click",
      );

      expect(clickRemovals).toHaveLength(1);
    });

    it("directive on <div> + consumer onClick — both fire, no preventDefault on consumer event", async () => {
      // For non-<a> targets the directive does NOT call evt.preventDefault.
      // A consumer's onClick that inspects evt.defaultPrevented must see
      // false — the directive's handler must coexist cleanly without
      // mutating the event for the consumer's view.
      const consumerSpy = vi.fn((evt: MouseEvent) => evt.defaultPrevented);
      const navigateSpy = vi.spyOn(router, "navigate");

      render(
        () => (
          <div
            use:link={{ routeName: "one-more-test" }}
            onClick={consumerSpy}
            data-testid="link"
          >
            Test
          </div>
        ),
        { wrapper },
      );

      await user.click(screen.getByTestId("link"));

      expect(consumerSpy).toHaveBeenCalledTimes(1);
      // Consumer's snapshot of defaultPrevented at observation time === false.
      // (Solid DOM-property handler runs before the addEventListener queue,
      // and the directive does not preventDefault on <div> anyway.)
      expect(consumerSpy.mock.results[0]?.value).toBe(false);
      expect(navigateSpy).toHaveBeenCalledTimes(1);
    });
  });

  // Documents gotcha #14 "use:link Requires useRouter Context" from
  // packages/solid/CLAUDE.md:
  //   The link directive calls useRouter() internally, so it must be used
  //   inside a component that has access to the router context.
  describe("RouterProvider requirement", () => {
    it("throws when rendered without RouterProvider", () => {
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      expect(() =>
        render(() => (
          <a use:link={{ routeName: "home" }} data-testid="link">
            Home
          </a>
        )),
      ).toThrow("useRouter must be used within a RouterProvider");

      consoleError.mockRestore();
    });
  });
});
