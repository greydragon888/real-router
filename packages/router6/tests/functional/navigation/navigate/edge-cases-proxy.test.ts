import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { createTestRouter } from "../../../helpers";

import type { Router } from "router6";

let router: Router;
const noop = () => undefined;

describe("router.navigate() - edge cases proxy", () => {
  beforeEach(() => {
    router = createTestRouter();

    router.start();
  });

  afterEach(() => {
    router.stop();

    vi.clearAllMocks();
  });

  describe("edge cases - section 12 analysis", () => {
    describe("throwing getter in opts", () => {
      it("should propagate exception when opts getter throws (isNavigationOptions validation)", () => {
        const evilOpts = {
          get replace(): boolean {
            throw new Error("Evil getter!");
          },
        };

        // 🔴 CRITICAL EDGE CASE: Getter exceptions propagate up
        // isNavigationOptions reads each field, triggering the getter
        // This documents current behavior - exceptions are NOT caught
        expect(() => {
          router.navigate("users", {}, evilOpts, noop);
        }).toThrowError("Evil getter!");
      });

      it("should handle opts with non-throwing getters", () => {
        const callback = vi.fn();
        const optsWithGetter = {
          get replace(): boolean {
            return true;
          },
        };

        router.navigate("users", {}, optsWithGetter, callback);

        expect(callback).toHaveBeenCalledWith(
          undefined,
          expect.objectContaining({ name: "users" }),
        );
      });
    });

    // -------------------------------------------------------------------------
    // 12.4.3: NavigationOptions with arbitrary fields
    // -------------------------------------------------------------------------

    describe("NavigationOptions with custom fields", () => {
      it("should preserve custom fields in state.meta.options", () => {
        const callback = vi.fn();
        const customOpts = {
          replace: true,
          customData: { foo: "bar", nested: { value: 123 } },
          myFlag: true,
        };

        router.navigate("users", {}, customOpts, callback);

        expect(callback).toHaveBeenCalledWith(
          undefined,
          expect.objectContaining({
            meta: expect.objectContaining({
              options: expect.objectContaining({
                replace: true,
                customData: { foo: "bar", nested: { value: 123 } },
                myFlag: true,
              }),
            }),
          }),
        );
      });

      it("should accept Symbol values in custom fields (no structuredClone)", () => {
        // Since state freezing moved to makeState (using Object.freeze, not structuredClone),
        // Symbol values are now accepted in NavigationOptions
        const testSymbol = Symbol("test");
        const optsWithSymbol = {
          reload: true,
          symbolField: testSymbol,
        };
        const callback = vi.fn();

        // Symbol values now work - no structuredClone is called on options
        // @ts-expect-error - testing runtime behavior with Symbol in options
        router.navigate("users", {}, optsWithSymbol, callback);

        expect(callback).toHaveBeenCalledWith(
          undefined,
          expect.objectContaining({ name: "users" }),
        );
      });

      it("should accept function values in custom fields (no structuredClone)", () => {
        // Since state freezing moved to makeState (using Object.freeze, not structuredClone),
        // function values are now accepted in NavigationOptions
        const optsWithFunction = {
          reload: true,
          customCallback: () => "test",
        };
        const callback = vi.fn();

        // Function values now work - no structuredClone is called on options
        // @ts-expect-error - testing runtime behavior with function in options
        router.navigate("users", {}, optsWithFunction, callback);

        expect(callback).toHaveBeenCalledWith(
          undefined,
          expect.objectContaining({ name: "users" }),
        );
      });
    });

    // -------------------------------------------------------------------------
    // 12.2.4: Recursive navigate from callback
    // -------------------------------------------------------------------------

    describe("Proxy objects handling", () => {
      it("should accept Proxy as params (passes isParams if returns valid values)", () => {
        const callback = vi.fn();
        // Proxy with object target passes isParams validation because:
        // - typeof proxy === "object" (true)
        // - Object.getPrototypeOf(proxy) === Object.prototype (true for plain object target)
        // - All accessed values are primitives
        const proxyParams = new Proxy(
          { id: 123 },
          {
            get(target, prop) {
              if (prop === "id") {
                return 999;
              } // Intercept id

              return Reflect.get(target, prop);
            },
          },
        );

        router.navigate("users.view", proxyParams, {}, callback);

        // Navigation succeeds, using the proxied value
        expect(callback).toHaveBeenCalledWith(
          undefined,
          expect.objectContaining({
            params: expect.objectContaining({ id: 999 }),
          }),
        );
      });

      it("should accept Proxy as opts (no structuredClone)", () => {
        // Since state freezing moved to makeState (using Object.freeze, not structuredClone),
        // Proxy objects in navigation options now work
        const proxyOpts = new Proxy(
          {},
          {
            get(_target, prop) {
              return prop === "replace" ? true : undefined;
            },
          },
        );
        const callback = vi.fn();

        // The navigation passes isNavigationOptions validation (Proxy returns correct values)
        // and Proxy options are now accepted (no structuredClone)
        router.navigate("users", {}, proxyOpts, callback);

        expect(callback).toHaveBeenCalledWith(
          undefined,
          expect.objectContaining({ name: "users" }),
        );
      });

      it("should handle plain objects that mimic Proxy behavior", () => {
        // Plain objects with getters work fine (unlike Proxy)
        const callback = vi.fn();
        const objectWithGetter = {
          get replace(): boolean {
            return true;
          },
        };

        router.navigate("users", {}, objectWithGetter, callback);

        expect(callback).toHaveBeenCalledWith(
          undefined,
          expect.objectContaining({
            meta: expect.objectContaining({
              options: expect.objectContaining({ replace: true }),
            }),
          }),
        );
      });
    });
  });
});
