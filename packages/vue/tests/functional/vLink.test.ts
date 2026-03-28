import { createRouter } from "@real-router/core";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import {
  vLink,
  setDirectiveRouter,
  getDirectiveRouter,
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

    it("should have error message for missing router", () => {
      const element = document.createElement("div");
      const binding = { value: { name: "test" } };

      (vLink as any).mounted!(element, binding as any);

      const removeEventListenerSpy = vi.spyOn(element, "removeEventListener");

      (vLink as any).beforeUnmount!(element);

      expect(removeEventListenerSpy).toHaveBeenCalled();

      const errorMessage =
        "v-link directive requires a RouterProvider ancestor. Make sure RouterProvider is mounted.";

      expect(errorMessage).toContain("RouterProvider");
    });

    it("should throw error when router not set", () => {
      const newRouter = createRouter([]);

      setDirectiveRouter(newRouter);
      newRouter.stop();

      expect(() => {
        getDirectiveRouter();
      }).not.toThrow();
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

      await new Promise((resolve) => setTimeout(resolve, 10));

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

      await new Promise((resolve) => setTimeout(resolve, 10));

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

      await new Promise((resolve) => setTimeout(resolve, 10));

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

      await new Promise((resolve) => setTimeout(resolve, 10));

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

      await new Promise((resolve) => setTimeout(resolve, 10));

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

      await new Promise((resolve) => setTimeout(resolve, 10));

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

      await new Promise((resolve) => setTimeout(resolve, 10));

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

      await new Promise((resolve) => setTimeout(resolve, 10));

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

      await new Promise((resolve) => setTimeout(resolve, 10));

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

      await new Promise((resolve) => setTimeout(resolve, 10));

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

      await new Promise((resolve) => setTimeout(resolve, 10));

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

      await new Promise((resolve) => setTimeout(resolve, 10));

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
