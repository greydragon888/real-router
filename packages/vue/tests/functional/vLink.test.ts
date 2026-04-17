import { createRouter } from "@real-router/core";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import {
  vLink,
  setDirectiveRouter,
  getDirectiveRouter,
  pushDirectiveRouter,
} from "../../src/directives/vLink";
import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router } from "@real-router/core";

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
      expect((vLink as any).mounted).toBeDefined();
      expect((vLink as any).updated).toBeDefined();
      expect((vLink as any).beforeUnmount).toBeDefined();
    });

    it("should set and get directive router", () => {
      const retrievedRouter = getDirectiveRouter();

      expect(retrievedRouter).toBe(router);
    });

    it("should clean up event listeners on beforeUnmount", () => {
      const element = document.createElement("div");
      const binding = { value: { name: "test" } };

      (vLink as any).mounted!(element, binding as any);

      const removeEventListenerSpy = vi.spyOn(element, "removeEventListener");

      (vLink as any).beforeUnmount!(element);

      expect(removeEventListenerSpy).toHaveBeenCalled();
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
      setDirectiveRouter(null as unknown as Router);

      const element = document.createElement("div");
      const binding = { value: { name: "home" } };

      expect(() => {
        (vLink as any).mounted!(element, binding as any);
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
      (vLink as any).mounted!(element, binding as any);

      // Then simulate RouterProvider removal
      setDirectiveRouter(null as unknown as Router);

      expect(() => {
        (vLink as any).updated!(element, binding as any);
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
        (vLink as any).mounted!(element, { value: null } as any);
      }).not.toThrow();

      // Element still receives a11y + cursor (mount-time setup before validation).
      expect(element.style.cursor).toBe("pointer");
      expect(element.getAttribute("role")).toBe("link");
      expect(consoleError).toHaveBeenCalledWith(
        expect.stringContaining("v-link directive received null/undefined"),
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
        (vLink as any).mounted!(element, { value: undefined } as any);
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
        (vLink as any).mounted!(element, { value: {} } as any);
      }).not.toThrow();
      expect(consoleError).toHaveBeenCalledWith(
        expect.stringContaining("missing a string `name` field"),
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
      (vLink as any).mounted!(element, { value: null } as any);

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
      (vLink as any).mounted!(element, {
        value: { name: "one-more-test" },
      } as any);

      expect(() => {
        (vLink as any).updated!(element, { value: null } as any);
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
      (vLink as any).mounted!(element, binding as any);

      expect(element.getAttribute("role")).toBe("link");
      expect(element.getAttribute("tabindex")).toBe("0");
      expect(element.style.cursor).toBe("pointer");
    });

    it("should not add role to anchor elements", () => {
      const element = document.createElement("a");
      const binding = { value: { name: "test" } };

      setDirectiveRouter(router);
      (vLink as any).mounted!(element, binding as any);

      expect(element.getAttribute("role")).toBeNull();
    });

    it("should not add role to button elements", () => {
      const element = document.createElement("button");
      const binding = { value: { name: "test" } };

      setDirectiveRouter(router);
      (vLink as any).mounted!(element, binding as any);

      expect(element.getAttribute("role")).toBeNull();
    });

    it("should handle click events", async () => {
      vi.spyOn(router, "navigate");

      const element = document.createElement("div");
      const binding = { value: { name: "one-more-test" } };

      setDirectiveRouter(router);
      (vLink as any).mounted!(element, binding as any);

      const clickEvent = new MouseEvent("click", {
        bubbles: true,
        button: 0,
      });

      element.dispatchEvent(clickEvent);

      expect(router.navigate).toHaveBeenCalledWith("one-more-test", {}, {});
    });

    it("should not navigate on right click", async () => {
      vi.spyOn(router, "navigate");

      const element = document.createElement("div");
      const binding = { value: { name: "one-more-test" } };

      setDirectiveRouter(router);
      (vLink as any).mounted!(element, binding as any);

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
      (vLink as any).mounted!(element, binding as any);

      const keyEvent = new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
      });

      element.dispatchEvent(keyEvent);

      expect(router.navigate).toHaveBeenCalledWith("one-more-test", {}, {});
    });

    it("should not navigate on Enter key for button elements (lifecycle)", async () => {
      vi.spyOn(router, "navigate");

      const element = document.createElement("button");
      const binding = { value: { name: "one-more-test" } };

      setDirectiveRouter(router);
      (vLink as any).mounted!(element, binding as any);

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
      (vLink as any).mounted!(element, binding as any);

      const keyEvent = new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
      });

      element.dispatchEvent(keyEvent);

      expect(router.navigate).toHaveBeenCalledWith(
        "test-route",
        { id: "1" },
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
      (vLink as any).mounted!(element, binding as any);

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
      (vLink as any).mounted!(element, binding as any);

      expect(element.getAttribute("role")).toBeNull();

      const clickEvent = new MouseEvent("click", {
        bubbles: true,
        button: 0,
      });

      element.dispatchEvent(clickEvent);

      expect(router.navigate).toHaveBeenCalledWith("test-route", {}, {});
    });

    it("should handle click on button element", async () => {
      vi.spyOn(router, "navigate");

      const element = document.createElement("button");
      const binding = { value: { name: "test-route" } };

      setDirectiveRouter(router);
      (vLink as any).mounted!(element, binding as any);

      expect(element.getAttribute("role")).toBeNull();

      const clickEvent = new MouseEvent("click", {
        bubbles: true,
        button: 0,
      });

      element.dispatchEvent(clickEvent);

      expect(router.navigate).toHaveBeenCalledWith("test-route", {}, {});
    });

    it("should preserve existing role attribute", () => {
      const element = document.createElement("div");

      element.setAttribute("role", "button");
      const binding = { value: { name: "test" } };

      setDirectiveRouter(router);
      (vLink as any).mounted!(element, binding as any);

      expect(element.getAttribute("role")).toBe("button");
    });

    it("should preserve existing tabindex attribute", () => {
      const element = document.createElement("div");

      element.setAttribute("tabindex", "1");
      const binding = { value: { name: "test" } };

      setDirectiveRouter(router);
      (vLink as any).mounted!(element, binding as any);

      expect(element.getAttribute("tabindex")).toBe("1");
    });

    it("should not navigate on right click (lifecycle)", async () => {
      vi.spyOn(router, "navigate");

      const element = document.createElement("div");
      const binding = { value: { name: "test-route" } };

      setDirectiveRouter(router);
      (vLink as any).mounted!(element, binding as any);

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
      (vLink as any).mounted!(element, binding as any);

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
      (vLink as any).mounted!(element, binding as any);

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
      (vLink as any).mounted!(element, binding as any);

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
      (vLink as any).mounted!(element, binding as any);

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
      let binding = { value: { name: "route-one" } };

      setDirectiveRouter(router);
      (vLink as any).mounted!(element, binding as any);

      const clickEvent1 = new MouseEvent("click", {
        bubbles: true,
        button: 0,
      });

      element.dispatchEvent(clickEvent1);

      expect(router.navigate).toHaveBeenCalledWith("route-one", {}, {});

      vi.clearAllMocks();

      binding = {
        value: { name: "route-two", params: { id: "42" } } as any,
      };
      (vLink as any).updated!(element, binding as any);

      const clickEvent2 = new MouseEvent("click", {
        bubbles: true,
        button: 0,
      });

      element.dispatchEvent(clickEvent2);

      expect(router.navigate).toHaveBeenCalledWith(
        "route-two",
        { id: "42" },
        {},
      );
    });

    it("should handle detach on element without handlers", () => {
      const element = document.createElement("div");

      const removeEventListenerSpy = vi.spyOn(element, "removeEventListener");

      (vLink as any).beforeUnmount!(element);

      expect(removeEventListenerSpy).not.toHaveBeenCalled();
    });
  });
});
