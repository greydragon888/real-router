import { render } from "@testing-library/svelte";
import { userEvent } from "@testing-library/user-event";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import {
  createTestRouterWithADefaultRouter,
  renderWithRouter,
} from "../helpers";
import LinkActionAnchorTest from "../helpers/LinkActionAnchorTest.svelte";
import LinkActionDoubleTest from "../helpers/LinkActionDoubleTest.svelte";
import LinkActionTest from "../helpers/LinkActionTest.svelte";
import LinkActionTestNoProvider from "../helpers/LinkActionTestNoProvider.svelte";
import LinkActionUpdateTest from "../helpers/LinkActionUpdateTest.svelte";
import LinkActionWithPresetAttributes from "../helpers/LinkActionWithPresetAttrs.svelte";

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

  it("should navigate on click", async () => {
    vi.spyOn(router, "navigate");

    renderWithRouter(router, LinkActionTest, {
      params: { name: "one-more-test" },
      element: "button",
    });

    const button = document.querySelector("button")!;

    await userEvent.click(button);

    expect(router.navigate).toHaveBeenCalledWith("one-more-test", {}, {});
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

    expect(router.navigate).toHaveBeenCalledWith("one-more-test", {}, {});
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

    expect(router.navigate).toHaveBeenCalledWith("one-more-test", {}, {});
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

    expect(router.navigate).toHaveBeenCalledWith("one-more-test", {}, {});
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

    expect(router.navigate).toHaveBeenCalledWith("one-more-test", {}, {});

    vi.clearAllMocks();

    component.updateParams({ name: "items", params: { id: "123" } });

    await userEvent.click(button);

    expect(router.navigate).toHaveBeenCalledWith("items", { id: "123" }, {});
  });

  it("should throw error when used outside RouterProvider", () => {
    expect(() => {
      render(LinkActionTestNoProvider, {
        props: { params: { name: "one-more-test" } },
      });
    }).toThrow("createLinkAction must be used within a RouterProvider");
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

    expect(router.navigate).toHaveBeenCalledWith("home", {}, {});

    vi.clearAllMocks();

    await userEvent.click(button2);

    expect(router.navigate).toHaveBeenCalledWith("about", {}, {});
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
    expect(router.navigate).toHaveBeenCalledWith("one-more-test", {}, {});
  });
});
