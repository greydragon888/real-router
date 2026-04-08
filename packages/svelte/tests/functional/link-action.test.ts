import { render } from "@testing-library/svelte";
import { userEvent } from "@testing-library/user-event";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import {
  createTestRouterWithADefaultRouter,
  renderWithRouter,
} from "../helpers";
import LinkActionDoubleTest from "../helpers/LinkActionDoubleTest.svelte";
import LinkActionTest from "../helpers/LinkActionTest.svelte";
import LinkActionTestNoProvider from "../helpers/LinkActionTestNoProvider.svelte";
import LinkActionUpdateTest from "../helpers/LinkActionUpdateTest.svelte";

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

    expect(button).toBeInTheDocument();

    await userEvent.click(button);

    expect(router.navigate).toHaveBeenCalledWith("one-more-test", {}, {});
  });

  it("should respect modifier keys (shouldNavigate)", () => {
    vi.spyOn(router, "navigate");

    renderWithRouter(router, LinkActionTest, {
      params: { name: "one-more-test" },
      element: "button",
    });

    const button = document.querySelector("button")!;
    const event = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
    });

    button.dispatchEvent(event);

    expect(router.navigate).not.toHaveBeenCalled();
  });

  it("should respect meta key", () => {
    vi.spyOn(router, "navigate");

    renderWithRouter(router, LinkActionTest, {
      params: { name: "one-more-test" },
      element: "button",
    });

    const button = document.querySelector("button")!;
    const event = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      metaKey: true,
    });

    button.dispatchEvent(event);

    expect(router.navigate).not.toHaveBeenCalled();
  });

  it("should respect alt key", () => {
    vi.spyOn(router, "navigate");

    renderWithRouter(router, LinkActionTest, {
      params: { name: "one-more-test" },
      element: "button",
    });

    const button = document.querySelector("button")!;
    const event = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      altKey: true,
    });

    button.dispatchEvent(event);

    expect(router.navigate).not.toHaveBeenCalled();
  });

  it("should respect shift key", () => {
    vi.spyOn(router, "navigate");

    renderWithRouter(router, LinkActionTest, {
      params: { name: "one-more-test" },
      element: "button",
    });

    const button = document.querySelector("button")!;
    const event = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      shiftKey: true,
    });

    button.dispatchEvent(event);

    expect(router.navigate).not.toHaveBeenCalled();
  });

  it("should set a11y attributes on non-interactive elements", () => {
    const { container } = renderWithRouter(router, LinkActionTest, {
      params: { name: "one-more-test" },
      element: "div",
    });

    const div = container.querySelector("div")!;

    expect(div).toBeDefined();
    expect(div.getAttribute("role")).toBe("link");
    expect(div.getAttribute("tabindex")).toBe("0");
  });

  it("should not override existing role attribute", () => {
    const { container } = renderWithRouter(router, LinkActionTest, {
      params: { name: "one-more-test" },
      element: "div",
    });

    const div = container.querySelector("div")!;

    div.setAttribute("role", "button");

    expect(div.getAttribute("role")).toBe("button");
  });

  it("should not override existing tabindex attribute", () => {
    const { container } = renderWithRouter(router, LinkActionTest, {
      params: { name: "one-more-test" },
      element: "div",
    });

    const div = container.querySelector("div")!;

    div.setAttribute("tabindex", "1");

    expect(div.getAttribute("tabindex")).toBe("1");
  });

  it("should not set a11y attributes on anchor elements", () => {
    renderWithRouter(router, LinkActionTest, {
      params: { name: "one-more-test" },
      element: "a",
    });

    const anchor = document.querySelector("a")!;

    expect(anchor.getAttribute("role")).toBeNull();
    expect(anchor.getAttribute("tabindex")).toBeNull();
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
    }).toThrow("createLinkAction must be called inside a RouterProvider");
  });

  it("should support multiple link actions in one component", async () => {
    vi.spyOn(router, "navigate");

    renderWithRouter(router, LinkActionDoubleTest, {
      params1: { name: "home" },
      params2: { name: "about" },
    });

    const button1 = document.querySelector("[data-testid='btn1']")!;
    const button2 = document.querySelector("[data-testid='btn2']")!;

    expect(button1).toBeInTheDocument();
    expect(button2).toBeInTheDocument();

    await userEvent.click(button1);

    expect(router.navigate).toHaveBeenCalledWith("home", {}, {});

    vi.clearAllMocks();

    await userEvent.click(button2);

    expect(router.navigate).toHaveBeenCalledWith("about", {}, {});
  });
});
