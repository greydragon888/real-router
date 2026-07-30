import { createRouter } from "@real-router/core";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import {
  vLink,
  setDirectiveRouter,
  getDirectiveRouter,
  pushDirectiveRouter,
} from "../../src/directives/vLink";
import { createTestRouterWithADefaultRouter } from "../helpers";

import type { LinkDirectiveValue } from "../../src/directives/vLink";
import type { Router } from "@real-router/core";
import type { DirectiveBinding, ObjectDirective } from "vue";

// `vLink` is declared as `Directive<HTMLElement, LinkDirectiveValue>`, a
// type that admits either the function-form or the object-form. The tests
// drive the object-form hooks directly without mounting a component, so we
// widen the reference once and reuse it. Avoids `as any` at every call site.
const vLinkAsObject = vLink as ObjectDirective<
  HTMLElement,
  LinkDirectiveValue | null | undefined
>;

// Tests construct `binding` as a minimal `{ value, oldValue? }` literal —
// the directive only reads those two fields. Casting through this alias
// keeps the inline literals concise while staying `any`-free at call sites.
type Binding = DirectiveBinding<LinkDirectiveValue | null | undefined>;

// Vue's `ObjectDirective` hook signatures require four parameters
// (`el, binding, vnode, prevVNode`) — the directive only reads `el` and
// `binding`, but type-checking still demands a 4-arity signature. Narrow the
// hooks to test-friendly 2-arity shapes (1-arity for `beforeUnmount`) so the
// call sites stay terse and stay `as any`-free.
const vLinkHooks: {
  mounted: (element: HTMLElement, binding: Binding) => void;
  updated: (element: HTMLElement, binding: Binding) => void;
  beforeUnmount: (element: HTMLElement) => void;
} = {
  mounted: vLinkAsObject.mounted as (element: HTMLElement, b: Binding) => void,
  updated: vLinkAsObject.updated as (element: HTMLElement, b: Binding) => void,
  beforeUnmount: vLinkAsObject.beforeUnmount as (element: HTMLElement) => void,
};

describe("v-link directive", () => {
  let router: Router;

  beforeEach(async () => {
    router = createTestRouterWithADefaultRouter();
    await router.start("/");
    setDirectiveRouter(router);
  });

  afterEach(() => {
    router.stop();
  });

  describe("directive registration", () => {
    it("should export vLink directive", () => {
      expect(vLink).toBeDefined();
      expect(vLinkHooks.mounted).toBeDefined();
      expect(vLinkHooks.updated).toBeDefined();
      expect(vLinkHooks.beforeUnmount).toBeDefined();
    });

    it("should set and get directive router", () => {
      const retrievedRouter = getDirectiveRouter();

      expect(retrievedRouter).toBe(router);
    });

    it("should clean up event listeners on beforeUnmount", () => {
      const element = document.createElement("div");
      const binding = { value: { name: "test" } };

      vLinkHooks.mounted(element, binding as unknown as Binding);

      const removeEventListenerSpy = vi.spyOn(element, "removeEventListener");

      vLinkHooks.beforeUnmount(element);

      expect(removeEventListenerSpy).toHaveBeenCalledTimes(2);
    });

    it("should return router when router is set", () => {
      const newRouter = createRouter([]);

      setDirectiveRouter(newRouter);

      expect(getDirectiveRouter()).toBe(newRouter);

      newRouter.stop();
      setDirectiveRouter(router);
    });

    it("should throw when v-link mounted without RouterProvider (no router set)", () => {
      // Force _router to null to simulate missing RouterProvider
      setDirectiveRouter(null);

      const element = document.createElement("div");
      const binding = { value: { name: "home" } };

      expect(() => {
        vLinkHooks.mounted(element, binding as unknown as Binding);
      }).toThrow(
        "v-link directive requires a RouterProvider ancestor. Make sure RouterProvider is mounted.",
      );

      // Restore router for other tests
      setDirectiveRouter(router);
    });

    it("should throw when v-link updated without RouterProvider (no router set)", () => {
      // First mount with a valid router
      const element = document.createElement("div");
      const binding = { value: { name: "home" } };

      setDirectiveRouter(router);
      vLinkHooks.mounted(element, binding as unknown as Binding);

      // Then simulate RouterProvider removal
      setDirectiveRouter(null);

      expect(() => {
        vLinkHooks.updated(element, binding as unknown as Binding);
      }).toThrow(
        "v-link directive requires a RouterProvider ancestor. Make sure RouterProvider is mounted.",
      );

      // Restore router for other tests
      setDirectiveRouter(router);
    });
  });

  describe("nested provider isolation (router stack)", () => {
    it("inner RouterProvider mount overrides outer; unmount restores outer", async () => {
      const { mount } = await import("@vue/test-utils");
      const { defineComponent, h, ref } = await import("vue");
      const { RouterProvider } = await import("../../src/RouterProvider.js");
      const outer = createTestRouterWithADefaultRouter();
      const inner = createTestRouterWithADefaultRouter();

      await outer.start("/");
      await inner.start("/");

      const showInner = ref(true);

      const App = defineComponent({
        setup() {
          return () =>
            h(
              RouterProvider,
              { router: outer },
              {
                default: () =>
                  showInner.value
                    ? h(
                        RouterProvider,
                        { router: inner },
                        { default: () => h("div") },
                      )
                    : h("div"),
              },
            );
        },
      });

      const wrapper = mount(App);

      // Inner is on top → directive sees inner.
      expect(getDirectiveRouter()).toBe(inner);

      showInner.value = false;
      await wrapper.vm.$nextTick();

      // Inner unmounted → directive falls back to outer.
      expect(getDirectiveRouter()).toBe(outer);

      wrapper.unmount();
      outer.stop();
      inner.stop();
    });

    it("out-of-order unmount removes the correct router from the stack", () => {
      // Clear the test setup router to isolate the stack.
      setDirectiveRouter(null);

      const a = createRouter([{ name: "a", path: "/a" }]);
      const b = createRouter([{ name: "b", path: "/b" }]);
      const c = createRouter([{ name: "c", path: "/c" }]);

      const releaseA = pushDirectiveRouter(a);
      const releaseB = pushDirectiveRouter(b);
      const releaseC = pushDirectiveRouter(c);

      expect(getDirectiveRouter()).toBe(c);

      // Release B (middle) — top should remain C.
      releaseB();

      expect(getDirectiveRouter()).toBe(c);

      releaseC();

      expect(getDirectiveRouter()).toBe(a);

      releaseA();

      expect(() => getDirectiveRouter()).toThrow(
        "v-link directive requires a RouterProvider ancestor",
      );

      a.stop();
      b.stop();
      c.stop();

      // Restore router for other tests
      setDirectiveRouter(router);
    });
  });

  describe("invalid binding values (defensive)", () => {
    it("should not crash when binding.value is null on mount", () => {
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const element = document.createElement("div");

      setDirectiveRouter(router);

      expect(() => {
        vLinkHooks.mounted(element, { value: null } as unknown as Binding);
      }).not.toThrow();

      // Element still receives a11y + cursor (mount-time setup before validation).
      expect(element.style.cursor).toBe("pointer");
      expect(element.getAttribute("role")).toBe("link");
      expect(consoleError).toHaveBeenCalledWith(
        "[real-router] v-link directive received null/undefined value. The element will not be wired for navigation.",
      );

      consoleError.mockRestore();
    });

    it("should not crash when binding.value is undefined on mount", () => {
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const element = document.createElement("div");

      setDirectiveRouter(router);

      expect(() => {
        vLinkHooks.mounted(element, { value: undefined } as unknown as Binding);
      }).not.toThrow();
      expect(consoleError).toHaveBeenCalled();

      consoleError.mockRestore();
    });

    it("should not crash when binding.value.name is missing", () => {
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const element = document.createElement("div");

      setDirectiveRouter(router);

      expect(() => {
        vLinkHooks.mounted(element, { value: {} } as unknown as Binding);
      }).not.toThrow();
      expect(consoleError).toHaveBeenCalledWith(
        "[real-router] v-link directive value is missing a string `name` field. The element will not be wired for navigation.",
      );

      consoleError.mockRestore();
    });

    it("should not attach click handler when binding.value is null", async () => {
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      vi.spyOn(router, "navigate");

      const element = document.createElement("div");

      setDirectiveRouter(router);
      vLinkHooks.mounted(element, { value: null } as unknown as Binding);

      element.dispatchEvent(
        new MouseEvent("click", { bubbles: true, button: 0 }),
      );

      expect(router.navigate).not.toHaveBeenCalled();

      consoleError.mockRestore();
    });

    it("should not crash when updated() switches to null binding", () => {
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const element = document.createElement("div");

      setDirectiveRouter(router);
      vLinkHooks.mounted(element, {
        value: { name: "one-more-test" },
      } as unknown as Binding);

      expect(() => {
        vLinkHooks.updated(element, { value: null } as unknown as Binding);
      }).not.toThrow();

      expect(consoleError).toHaveBeenCalled();

      consoleError.mockRestore();
    });
  });

  describe("directive lifecycle", () => {
    it("should call mounted hook", () => {
      const element = document.createElement("div");
      const binding = { value: { name: "test" } };

      setDirectiveRouter(router);
      vLinkHooks.mounted(element, binding as unknown as Binding);

      expect(element.getAttribute("role")).toBe("link");
      expect(element.getAttribute("tabindex")).toBe("0");
      expect(element.style.cursor).toBe("pointer");
    });

    it("should not add role to anchor elements", () => {
      const element = document.createElement("a");
      const binding = { value: { name: "test" } };

      setDirectiveRouter(router);
      vLinkHooks.mounted(element, binding as unknown as Binding);

      expect(element.getAttribute("role")).toBeNull();
    });

    it("should not add role to button elements", () => {
      const element = document.createElement("button");
      const binding = { value: { name: "test" } };

      setDirectiveRouter(router);
      vLinkHooks.mounted(element, binding as unknown as Binding);

      expect(element.getAttribute("role")).toBeNull();
    });

    it("should handle click events", async () => {
      vi.spyOn(router, "navigate");

      const element = document.createElement("div");
      const binding = { value: { name: "one-more-test" } };

      setDirectiveRouter(router);
      vLinkHooks.mounted(element, binding as unknown as Binding);

      const clickEvent = new MouseEvent("click", {
        bubbles: true,
        button: 0,
      });

      element.dispatchEvent(clickEvent);

      expect(router.navigate).toHaveBeenCalledWith(
        "one-more-test",
        {},
        undefined,
        {},
      );
    });

    it("should not navigate on right click", async () => {
      vi.spyOn(router, "navigate");

      const element = document.createElement("div");
      const binding = { value: { name: "one-more-test" } };

      setDirectiveRouter(router);
      vLinkHooks.mounted(element, binding as unknown as Binding);

      const clickEvent = new MouseEvent("click", {
        bubbles: true,
        button: 2,
      });

      element.dispatchEvent(clickEvent);

      expect(router.navigate).not.toHaveBeenCalled();
    });

    it("should handle Enter key on non-button elements", async () => {
      vi.spyOn(router, "navigate");

      const element = document.createElement("div");
      const binding = { value: { name: "one-more-test" } };

      setDirectiveRouter(router);
      vLinkHooks.mounted(element, binding as unknown as Binding);

      const keyEvent = new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
      });

      element.dispatchEvent(keyEvent);

      expect(router.navigate).toHaveBeenCalledWith(
        "one-more-test",
        {},
        undefined,
        {},
      );
    });

    it("should not navigate on Enter key for button elements (lifecycle)", async () => {
      vi.spyOn(router, "navigate");

      const element = document.createElement("button");
      const binding = { value: { name: "one-more-test" } };

      setDirectiveRouter(router);
      vLinkHooks.mounted(element, binding as unknown as Binding);

      const keyEvent = new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
      });

      element.dispatchEvent(keyEvent);

      expect(router.navigate).not.toHaveBeenCalled();
    });

    it("should handle Enter key on non-button div", async () => {
      vi.spyOn(router, "navigate");

      const element = document.createElement("div");
      const binding = { value: { name: "test-route", params: { id: "1" } } };

      setDirectiveRouter(router);
      vLinkHooks.mounted(element, binding as unknown as Binding);

      const keyEvent = new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
      });

      element.dispatchEvent(keyEvent);

      expect(router.navigate).toHaveBeenCalledWith(
        "test-route",
        { id: "1" },
        undefined,
        {},
      );
    });

    it("should handle Enter key on button with options", async () => {
      vi.spyOn(router, "navigate");

      const element = document.createElement("button");
      const binding = {
        value: {
          name: "test-route",
          options: { replace: true },
        },
      };

      setDirectiveRouter(router);
      vLinkHooks.mounted(element, binding as unknown as Binding);

      const keyEvent = new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
      });

      element.dispatchEvent(keyEvent);

      expect(router.navigate).not.toHaveBeenCalled();
    });

    it("should handle click on anchor element", async () => {
      vi.spyOn(router, "navigate");

      const element = document.createElement("a");
      const binding = { value: { name: "test-route" } };

      setDirectiveRouter(router);
      vLinkHooks.mounted(element, binding as unknown as Binding);

      expect(element.getAttribute("role")).toBeNull();

      const clickEvent = new MouseEvent("click", {
        bubbles: true,
        button: 0,
      });

      element.dispatchEvent(clickEvent);

      expect(router.navigate).toHaveBeenCalledWith(
        "test-route",
        {},
        undefined,
        {},
      );
    });

    it("should handle click on button element", async () => {
      vi.spyOn(router, "navigate");

      const element = document.createElement("button");
      const binding = { value: { name: "test-route" } };

      setDirectiveRouter(router);
      vLinkHooks.mounted(element, binding as unknown as Binding);

      expect(element.getAttribute("role")).toBeNull();

      const clickEvent = new MouseEvent("click", {
        bubbles: true,
        button: 0,
      });

      element.dispatchEvent(clickEvent);

      expect(router.navigate).toHaveBeenCalledWith(
        "test-route",
        {},
        undefined,
        {},
      );
    });

    it("should preserve existing role attribute", () => {
      const element = document.createElement("div");

      element.setAttribute("role", "button");
      const binding = { value: { name: "test" } };

      setDirectiveRouter(router);
      vLinkHooks.mounted(element, binding as unknown as Binding);

      expect(element.getAttribute("role")).toBe("button");
    });

    it("should preserve existing tabindex attribute", () => {
      const element = document.createElement("div");

      element.setAttribute("tabindex", "1");
      const binding = { value: { name: "test" } };

      setDirectiveRouter(router);
      vLinkHooks.mounted(element, binding as unknown as Binding);

      expect(element.getAttribute("tabindex")).toBe("1");
    });

    it("should not navigate on right click (lifecycle)", async () => {
      vi.spyOn(router, "navigate");

      const element = document.createElement("div");
      const binding = { value: { name: "test-route" } };

      setDirectiveRouter(router);
      vLinkHooks.mounted(element, binding as unknown as Binding);

      const clickEvent = new MouseEvent("click", {
        bubbles: true,
        button: 2,
      });

      element.dispatchEvent(clickEvent);

      expect(router.navigate).not.toHaveBeenCalled();
    });

    it("should not navigate on other keys", async () => {
      vi.spyOn(router, "navigate");

      const element = document.createElement("div");
      const binding = { value: { name: "test-route" } };

      setDirectiveRouter(router);
      vLinkHooks.mounted(element, binding as unknown as Binding);

      const keyEvent = new KeyboardEvent("keydown", {
        key: "Space",
        bubbles: true,
      });

      element.dispatchEvent(keyEvent);

      expect(router.navigate).not.toHaveBeenCalled();
    });

    it("should not navigate on Ctrl+click", async () => {
      vi.spyOn(router, "navigate");

      const element = document.createElement("div");
      const binding = { value: { name: "one-more-test" } };

      setDirectiveRouter(router);
      vLinkHooks.mounted(element, binding as unknown as Binding);

      const clickEvent = new MouseEvent("click", {
        bubbles: true,
        button: 0,
        ctrlKey: true,
      });

      element.dispatchEvent(clickEvent);

      expect(router.navigate).not.toHaveBeenCalled();
    });

    it("should not navigate on Meta+click", async () => {
      vi.spyOn(router, "navigate");

      const element = document.createElement("div");
      const binding = { value: { name: "one-more-test" } };

      setDirectiveRouter(router);
      vLinkHooks.mounted(element, binding as unknown as Binding);

      const clickEvent = new MouseEvent("click", {
        bubbles: true,
        button: 0,
        metaKey: true,
      });

      element.dispatchEvent(clickEvent);

      expect(router.navigate).not.toHaveBeenCalled();
    });

    it("should not navigate on Space key on non-button div", async () => {
      vi.spyOn(router, "navigate");

      const element = document.createElement("div");
      const binding = { value: { name: "one-more-test" } };

      setDirectiveRouter(router);
      vLinkHooks.mounted(element, binding as unknown as Binding);

      const keyEvent = new KeyboardEvent("keydown", {
        key: " ",
        bubbles: true,
      });

      element.dispatchEvent(keyEvent);

      expect(router.navigate).not.toHaveBeenCalled();
    });

    it("should call updated hook and update handlers", async () => {
      vi.spyOn(router, "navigate");

      const element = document.createElement("div");
      // Widen the initial value type so the reassignment below (with `params`)
      // type-checks without contracting `binding` to the narrow `name`-only shape.
      let binding: { value: { name: string; params?: { id: string } } } = {
        value: { name: "route-one" },
      };

      setDirectiveRouter(router);
      vLinkHooks.mounted(element, binding as unknown as Binding);

      const clickEvent1 = new MouseEvent("click", {
        bubbles: true,
        button: 0,
      });

      element.dispatchEvent(clickEvent1);

      expect(router.navigate).toHaveBeenCalledWith(
        "route-one",
        {},
        undefined,
        {},
      );

      vi.clearAllMocks();

      binding = {
        value: { name: "route-two", params: { id: "42" } },
      };
      vLinkHooks.updated(element, binding as unknown as Binding);

      const clickEvent2 = new MouseEvent("click", {
        bubbles: true,
        button: 0,
      });

      element.dispatchEvent(clickEvent2);

      expect(router.navigate).toHaveBeenCalledWith(
        "route-two",
        { id: "42" },
        undefined,
        {},
      );
    });

    it("should handle detach on element without handlers", () => {
      const element = document.createElement("div");

      const removeEventListenerSpy = vi.spyOn(element, "removeEventListener");

      vLinkHooks.beforeUnmount(element);

      expect(removeEventListenerSpy).not.toHaveBeenCalled();
    });

    // Hot-path guard (audit §8.2 H6): `updated()` short-circuits when
    // `binding.value === binding.oldValue`. Without this, every parent
    // rerender (common case on Link-heavy pages — any unrelated state
    // change re-runs the render fn) would detach + reattach listeners
    // even though the binding is identical.
    it("CLAUDE.md §8.2 H6: updated() short-circuits when binding.value === binding.oldValue", () => {
      const element = document.createElement("div");
      const stableValue = { name: "stable-route" };
      const binding = { value: stableValue };

      setDirectiveRouter(router);
      vLinkHooks.mounted(element, binding as unknown as Binding);

      const removeEventListenerSpy = vi.spyOn(element, "removeEventListener");
      const addEventListenerSpy = vi.spyOn(element, "addEventListener");

      // Simulate a parent re-render that re-invokes the directive's
      // `updated` hook with the SAME binding value reference. Vue invokes
      // `updated` on every parent rerender regardless of binding identity.
      vLinkHooks.updated(element, {
        value: stableValue,
        oldValue: stableValue,
      } as unknown as Binding);

      // No detach / no attach — the guard collapsed the work to zero.
      expect(removeEventListenerSpy).not.toHaveBeenCalled();
      expect(addEventListenerSpy).not.toHaveBeenCalled();
    });
  });
});
