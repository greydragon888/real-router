import { render } from "@testing-library/svelte";
import { userEvent } from "@testing-library/user-event";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import {
  createTestRouterWithADefaultRouter,
  renderWithRouter,
} from "../helpers";
import CreateLinkActionInEffect from "../helpers/CreateLinkActionInEffect.svelte";
import CreateLinkActionInTimeout from "../helpers/CreateLinkActionInTimeout.svelte";
import LinkActionAnchorTest from "../helpers/LinkActionAnchorTest.svelte";
import LinkActionDoubleTest from "../helpers/LinkActionDoubleTest.svelte";
import LinkActionNestedChild from "../helpers/LinkActionNestedChild.svelte";
import LinkActionTest from "../helpers/LinkActionTest.svelte";
import LinkActionTestNoProvider from "../helpers/LinkActionTestNoProvider.svelte";
import LinkActionUpdateTest from "../helpers/LinkActionUpdateTest.svelte";
import LinkActionWithPresetAttributes from "../helpers/LinkActionWithPresetAttrs.svelte";
import ManyLinkActionsFn from "../helpers/ManyLinkActionsFn.svelte";

import type { Router } from "@real-router/core";

describe("createLinkAction", () => {
  let router: Router;

  beforeEach(async () => {
    router = createTestRouterWithADefaultRouter();
    await router.start("/");
  });

  afterEach(() => {
    router.stop();
  });

  it("N use:link nodes register ZERO per-node click/keydown listeners — event delegation (#1253)", () => {
    // #1253 — the action delegated its click/keydown to a per-router singleton
    // at `document` instead of attaching 2 listeners per node. Mounting N nodes
    // must register ZERO per-node click/keydown listeners; the delegated pair
    // lives on `document` (not an HTMLElement, so the prototype spy misses it).
    const addSpy = vi.spyOn(HTMLElement.prototype, "addEventListener");

    renderWithRouter(router, ManyLinkActionsFn, { count: 4 });

    const perNode = addSpy.mock.calls.filter(
      ([type]) => type === "click" || type === "keydown",
    );

    expect(perNode).toHaveLength(0);

    addSpy.mockRestore();
  });

  it("delegated handler walks up from a descendant target to the registered link (#1253)", async () => {
    vi.spyOn(router, "navigate");

    renderWithRouter(router, LinkActionNestedChild, { name: "home" });

    // Click the inner <span> — the delegated `document` handler walks up from
    // the descendant target to the nearest registered node (the <a>).
    const child = document.querySelector("[data-testid='child']")!;

    child.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    );

    expect(router.navigate).toHaveBeenCalledWith("home", {}, undefined, {});
  });

  it("delegated click with no registered link ancestor is ignored (#1253)", () => {
    vi.spyOn(router, "navigate");

    // Mount a link so the per-router `document` delegation listener is attached.
    renderWithRouter(router, LinkActionTest, {
      params: { name: "home" },
      element: "button",
    });

    // A click bubbling to `document` from an element with no registered
    // ancestor: findRegisteredNode walks to the root and returns undefined.
    const stray = document.createElement("div");

    document.body.append(stray);

    stray.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    );

    // And a click whose target is `document` itself (not an HTMLElement) —
    // exercises the non-HTMLElement guard in findRegisteredNode.
    document.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    );

    expect(router.navigate).not.toHaveBeenCalled();

    stray.remove();
  });

  it("delegated Enter with no registered link ancestor is ignored (#1253)", () => {
    vi.spyOn(router, "navigate");

    renderWithRouter(router, LinkActionTest, {
      params: { name: "home" },
      element: "div",
    });

    const stray = document.createElement("div");

    document.body.append(stray);

    stray.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true,
      }),
    );

    expect(router.navigate).not.toHaveBeenCalled();

    stray.remove();
  });

  it("should navigate on click", async () => {
    vi.spyOn(router, "navigate");

    renderWithRouter(router, LinkActionTest, {
      params: { name: "one-more-test" },
      element: "button",
    });

    const button = document.querySelector("button")!;

    await userEvent.click(button);

    expect(router.navigate).toHaveBeenCalledWith(
      "one-more-test",
      {},
      undefined,
      {},
    );
  });

  it.each([
    { label: "ctrl", modifiers: { ctrlKey: true } },
    { label: "meta", modifiers: { metaKey: true } },
    { label: "alt", modifiers: { altKey: true } },
    { label: "shift", modifiers: { shiftKey: true } },
  ] as const)(
    "should not navigate when $label modifier is pressed",
    ({ modifiers }) => {
      vi.spyOn(router, "navigate");

      renderWithRouter(router, LinkActionTest, {
        params: { name: "one-more-test" },
        element: "button",
      });

      const button = document.querySelector("button")!;
      const event = new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        ...modifiers,
      });

      button.dispatchEvent(event);

      expect(router.navigate).not.toHaveBeenCalled();
    },
  );

  it("should set a11y attributes on non-interactive elements", () => {
    const { container } = renderWithRouter(router, LinkActionTest, {
      params: { name: "one-more-test" },
      element: "div",
    });

    const div = container.querySelector("div")!;

    expect(div.getAttribute("role")).toBe("link");
    expect(div.getAttribute("tabindex")).toBe("0");
  });

  it("should preserve role attribute that was already on the element before mount", () => {
    const { container } = renderWithRouter(
      router,
      LinkActionWithPresetAttributes,
      {
        params: { name: "one-more-test" },
      },
    );

    const div = container.querySelector("div")!;

    // The element had role="button" before the action ran — action must not overwrite it.
    expect(div.getAttribute("role")).toBe("button");
  });

  it("should preserve tabindex attribute that was already on the element before mount", () => {
    const { container } = renderWithRouter(
      router,
      LinkActionWithPresetAttributes,
      {
        params: { name: "one-more-test" },
      },
    );

    const div = container.querySelector("div")!;

    // The element had tabindex="2" before the action ran — action must not overwrite it.
    expect(div.getAttribute("tabindex")).toBe("2");
  });

  it("should not set a11y attributes on anchor elements but still navigate on click", async () => {
    vi.spyOn(router, "navigate");

    renderWithRouter(router, LinkActionTest, {
      params: { name: "one-more-test" },
      element: "a",
    });

    const anchor = document.querySelector("a")!;

    expect(anchor.getAttribute("role")).toBeNull();
    expect(anchor.getAttribute("tabindex")).toBeNull();

    await userEvent.click(anchor);

    expect(router.navigate).toHaveBeenCalledWith(
      "one-more-test",
      {},
      undefined,
      {},
    );
  });

  it("should not set a11y attributes on button elements", () => {
    renderWithRouter(router, LinkActionTest, {
      params: { name: "one-more-test" },
      element: "button",
    });

    const button = document.querySelector("button")!;

    expect(button.getAttribute("role")).toBeNull();
    expect(button.getAttribute("tabindex")).toBeNull();
  });

  it("should navigate on Enter key for non-button elements", () => {
    vi.spyOn(router, "navigate");

    const { container } = renderWithRouter(router, LinkActionTest, {
      params: { name: "one-more-test" },
      element: "div",
    });

    const div = container.querySelector("div")!;

    div.focus();

    const event = new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    });

    div.dispatchEvent(event);

    expect(router.navigate).toHaveBeenCalledWith(
      "one-more-test",
      {},
      undefined,
      {},
    );
  });

  it("should not navigate on Enter key for button elements", () => {
    vi.spyOn(router, "navigate");

    const { container } = renderWithRouter(router, LinkActionTest, {
      params: { name: "one-more-test" },
      element: "button",
    });

    const button = container.querySelector("button")!;

    button.focus();

    const event = new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    });

    button.dispatchEvent(event);

    expect(router.navigate).not.toHaveBeenCalled();
  });

  it("should navigate on Enter key for div elements", () => {
    vi.spyOn(router, "navigate");

    const { container } = renderWithRouter(router, LinkActionTest, {
      params: { name: "one-more-test" },
      element: "div",
    });

    const div = container.querySelector("div")!;

    div.focus();

    const event = new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    });

    div.dispatchEvent(event);

    expect(router.navigate).toHaveBeenCalledWith(
      "one-more-test",
      {},
      undefined,
      {},
    );
  });

  // Documents WAI-ARIA semantics: role="link" activates on Enter only,
  // unlike role="button" which also accepts Space. applyLinkA11y sets role="link",
  // so Space MUST NOT trigger navigation. If this behavior changes to accept Space,
  // that is a breaking a11y change and this test should be updated intentionally.
  it("should NOT navigate on Space key (WAI-ARIA role=link accepts Enter only)", () => {
    vi.spyOn(router, "navigate");

    const { container } = renderWithRouter(router, LinkActionTest, {
      params: { name: "one-more-test" },
      element: "div",
    });

    const div = container.querySelector("div")!;

    div.focus();

    const event = new KeyboardEvent("keydown", {
      key: " ",
      bubbles: true,
      cancelable: true,
    });

    div.dispatchEvent(event);

    expect(router.navigate).not.toHaveBeenCalled();
  });

  it("should remove event listeners on destroy", async () => {
    vi.spyOn(router, "navigate");

    const { unmount } = renderWithRouter(router, LinkActionTest, {
      params: { name: "one-more-test" },
      element: "button",
    });

    const button = document.querySelector("button")!;

    unmount();

    await userEvent.click(button);

    expect(router.navigate).not.toHaveBeenCalled();
  });

  it("should pass route params to navigate", async () => {
    vi.spyOn(router, "navigate");

    renderWithRouter(router, LinkActionTest, {
      params: { name: "items.item", params: { id: "456" } },
      element: "button",
    });

    const button = document.querySelector("button")!;

    await userEvent.click(button);

    expect(router.navigate).toHaveBeenCalledWith(
      "items.item",
      { id: "456" },
      undefined,
      {},
    );
  });

  it("should pass navigation options to navigate", async () => {
    vi.spyOn(router, "navigate");

    renderWithRouter(router, LinkActionTest, {
      params: {
        name: "one-more-test",
        options: { replace: true },
      },
      element: "button",
    });

    const button = document.querySelector("button")!;

    await userEvent.click(button);

    expect(router.navigate).toHaveBeenCalledWith(
      "one-more-test",
      {},
      undefined,
      { replace: true },
    );
  });

  it("should call update method when action params change", async () => {
    vi.spyOn(router, "navigate");

    const { container, component } = renderWithRouter(
      router,
      LinkActionUpdateTest,
      {
        initialParams: { name: "one-more-test" },
      },
    );

    const button = container.querySelector("button")!;

    await userEvent.click(button);

    expect(router.navigate).toHaveBeenCalledWith(
      "one-more-test",
      {},
      undefined,
      {},
    );

    vi.clearAllMocks();

    component.updateParams({ name: "items", params: { id: "123" } });

    await userEvent.click(button);

    expect(router.navigate).toHaveBeenCalledWith(
      "items",
      { id: "123" },
      undefined,
      {},
    );
  });

  it("should throw error when used outside RouterProvider", () => {
    expect(() => {
      render(LinkActionTestNoProvider, {
        props: { params: { name: "one-more-test" } },
      });
    }).toThrow("createLinkAction must be used within a RouterProvider");
  });

  // Locks Svelte 5 context-inheritance for `$effect`: `createLinkAction` is a
  // factory that captures router context via `getContext()`, and `$effect`
  // callbacks run within the same context that was active at init. The
  // factory therefore RESOLVES successfully inside `$effect` when provider
  // is mounted. Closes CLAUDE.md gotcha #20 audit gap.
  it("should resolve when called inside $effect (Svelte 5 context inheritance)", async () => {
    let capturedAction: unknown = "not-called";
    let capturedError: unknown = "not-called";

    renderWithRouter(router, CreateLinkActionInEffect, {
      onCapture: (action: unknown, err: unknown) => {
        capturedAction = action;
        capturedError = err;
      },
    });

    await Promise.resolve();

    expect(capturedError).toBeNull();
    expect(typeof capturedAction).toBe("function");
  });

  // Locks the actual misuse contract: calling `createLinkAction` from an
  // async callback (setTimeout, fetch) runs OUTSIDE `current_component_context`
  // and Svelte 5 raises `lifecycle_outside_component`. This is the
  // user-visible signal that the factory must be called during init —
  // CLAUDE.md gotcha #20 ("createLinkAction Is a Factory — Call During Init").
  it("should throw 'lifecycle_outside_component' when called from setTimeout (outside component context)", async () => {
    let capturedError: unknown = "not-called";

    renderWithRouter(router, CreateLinkActionInTimeout, {
      onCapture: (_action: unknown, err: unknown) => {
        capturedError = err;
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 16));

    expect(capturedError).toBeInstanceOf(Error);
    expect((capturedError as Error).message).toMatch(
      /lifecycle_outside_component|getContext/,
    );
  });

  it("should support multiple link actions in one component", async () => {
    vi.spyOn(router, "navigate");

    renderWithRouter(router, LinkActionDoubleTest, {
      params1: { name: "home" },
      params2: { name: "about" },
    });

    const button1 = document.querySelector("[data-testid='btn1']")!;
    const button2 = document.querySelector("[data-testid='btn2']")!;

    await userEvent.click(button1);

    expect(router.navigate).toHaveBeenCalledWith("home", {}, undefined, {});

    vi.clearAllMocks();

    await userEvent.click(button2);

    expect(router.navigate).toHaveBeenCalledWith("about", {}, undefined, {});
  });

  it("should not navigate when anchor has target=_blank", async () => {
    vi.spyOn(router, "navigate");

    renderWithRouter(router, LinkActionAnchorTest, {
      params: { name: "one-more-test" },
      target: "_blank",
    });

    const anchor = document.querySelector("a")!;

    // Use a real click event to trigger the click handler — userEvent on _blank
    // anchors triggers JSDOM "Not implemented: navigation" warnings.
    const event = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
    });

    anchor.dispatchEvent(event);

    // Default not prevented — browser handles it (opens new tab).
    expect(event.defaultPrevented).toBe(false);
    expect(router.navigate).not.toHaveBeenCalled();
  });

  // Closes review §5.11 row 4: the `target="_blank"` skip ONLY applies to
  // `<a>` elements (the implementation checks `node instanceof HTMLAnchorElement`).
  // On `<button>` and `<div>`, the target attribute is meaningless to the
  // browser (target is anchor-specific HTML), so the action still navigates.
  // Locks this asymmetry so a future refactor that generalizes the check
  // wouldn't silently break button/div use cases.
  it("non-anchor element with target='_blank' attribute → still navigates (anchor-specific skip)", async () => {
    vi.spyOn(router, "navigate");

    renderWithRouter(router, LinkActionTest, {
      params: { name: "home" },
      element: "button",
    });

    const button = document.querySelector("button")!;

    // Manually set target attribute (Svelte doesn't pass arbitrary attrs to
    // the test helper, but the runtime check inspects `getAttribute("target")`).
    button.setAttribute("target", "_blank");

    await userEvent.click(button);

    // <button target="_blank"> is not an anchor → instanceof check fails → navigate fires.
    expect(router.navigate).toHaveBeenCalledWith("home", {}, undefined, {});
  });

  it("div with target='_blank' attribute → still navigates", async () => {
    vi.spyOn(router, "navigate");

    renderWithRouter(router, LinkActionTest, {
      params: { name: "home" },
      element: "div",
    });

    const element = document.querySelector("div[role='link']")!;

    element.setAttribute("target", "_blank");

    // Use a real click event to avoid jsdom navigation warnings.
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });

    element.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(router.navigate).toHaveBeenCalledWith("home", {}, undefined, {});
  });

  // Closes review §5.11 row 12: mount → destroy → mount again must work.
  // The factory captures router at init, but each `use:` invocation creates
  // a fresh closure (with its own listeners + currentParams). Remounting
  // gives a clean state.
  it("re-mount after destroy: each mount is an independent action lifecycle", async () => {
    vi.spyOn(router, "navigate");

    const { unmount } = renderWithRouter(router, LinkActionTest, {
      params: { name: "home" },
    });

    const firstButton = document.querySelector("button")!;

    await userEvent.click(firstButton);

    expect(router.navigate).toHaveBeenCalledTimes(1);

    // Tear down.
    unmount();

    expect(document.querySelector("button")).toBeNull();

    // Fresh mount in same test — router context is the same, but the action
    // creates a new closure + listeners.
    renderWithRouter(router, LinkActionTest, {
      params: { name: "about" },
    });

    const secondButton = document.querySelector("button")!;

    await userEvent.click(secondButton);

    expect(router.navigate).toHaveBeenCalledTimes(2);
    expect(router.navigate).toHaveBeenLastCalledWith(
      "about",
      {},
      undefined,
      {},
    );
  });

  // Closes review §5.11 row 15: `currentParams` is captured by closure and
  // reassigned by `update()`. A click reads `currentParams.*` at click time
  // — so an `update()` BEFORE the click switches the navigation target.
  // This complements existing "should call update method when action params
  // change" test (which validates update→click) by adding the in-flight
  // closure-snapshot semantics: a click in flight uses the params snapshot
  // at the moment `router.navigate(...)` was invoked.
  it("closure snapshot: navigate args bound at click time, in-flight nav unaffected by later update()", async () => {
    const navigateSpy = vi.spyOn(router, "navigate");

    const { component } = renderWithRouter(router, LinkActionUpdateTest, {
      initialParams: { name: "home" },
    });

    const button = document.querySelector("button")!;

    // Click → navigate("home", ...) is invoked synchronously inside
    // handleClick. The Promise from router.navigate is now pending.
    await userEvent.click(button);

    expect(navigateSpy).toHaveBeenCalledTimes(1);
    expect(navigateSpy).toHaveBeenLastCalledWith("home", {}, undefined, {});

    // Now update params. Since router.navigate was already called with the
    // OLD params, the in-flight call is unaffected. Pin: NO second call.
    component.updateParams({ name: "about" });

    expect(navigateSpy).toHaveBeenCalledTimes(1);

    // Subsequent click uses the new params.
    await userEvent.click(button);

    expect(navigateSpy).toHaveBeenCalledTimes(2);
    expect(navigateSpy).toHaveBeenLastCalledWith("about", {}, undefined, {});
  });

  // #1253 — with event delegation the listeners live on `document`, not on the
  // node. A manually-detached element (removed WITHOUT Svelte unmount, so
  // `destroy()` never ran and its WeakMap entry survives) no longer fires the
  // handler: a click on a detached node doesn't bubble up to `document`, so the
  // delegated handler never sees it. This is a DELIBERATE behavior change from
  // the per-node-listener era (where a detached node still navigated) — it
  // matches sv-router's global delegation and is documented in CLAUDE.md.
  it("element manually removed from DOM → no navigation, no error (delegated)", () => {
    vi.spyOn(router, "navigate");

    renderWithRouter(router, LinkActionTest, {
      params: { name: "home" },
    });

    const button = document.querySelector("button")!;

    // Detach the element manually (NOT via Svelte unmount).
    button.remove();

    expect(document.body.contains(button)).toBe(false);

    // Click on a detached node doesn't reach the `document` delegation root.
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });

    button.dispatchEvent(event);

    expect(router.navigate).not.toHaveBeenCalled();
  });

  // Closes review §5.11 row 17: hash asymmetry pin-test. The action's
  // `LinkActionParams` shape does NOT include `hash`. If a consumer
  // attempts to pass `hash` via the params bag at runtime (TypeScript
  // would reject, but `as` casts could bypass it), the property is
  // silently ignored — the action calls `router.navigate(name, params, options)`
  // without ever consulting a `hash` field. Documented as a known asymmetry
  // with `<Link hash>` in README/CLAUDE.md; locked here against accidental
  // future "we should support hash here too" refactors that would diverge
  // from `<Link>` semantics.
  it("hash field on params bag → ignored (action does NOT call navigateWithHash)", async () => {
    vi.spyOn(router, "navigate");

    renderWithRouter(router, LinkActionTest, {
      // Smuggle a `hash` field through the runtime — TypeScript would
      // reject this; testing the runtime guard.
      params: {
        name: "home",

        hash: "section",
      },
    });

    const button = document.querySelector("button")!;

    await userEvent.click(button);

    // The hash is NOT in the call arguments — confirms action uses
    // navigate directly, not navigateWithHash, and the unknown `hash`
    // field is ignored.
    expect(router.navigate).toHaveBeenCalledWith("home", {}, undefined, {});
    expect(router.navigate).not.toHaveBeenCalledWith(
      "home",
      expect.anything(),
      expect.objectContaining({ hash: "section" }),
    );
  });

  it("should still navigate when anchor has no target", async () => {
    vi.spyOn(router, "navigate");

    renderWithRouter(router, LinkActionAnchorTest, {
      params: { name: "one-more-test" },
    });

    const anchor = document.querySelector("a")!;

    const event = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
    });

    anchor.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(router.navigate).toHaveBeenCalledWith(
      "one-more-test",
      {},
      undefined,
      {},
    );
  });
});
