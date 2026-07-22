import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { createTestRouter } from "../../../helpers";

import type { Router } from "@real-router/core";

let router: Router;

describe("router.navigate() - edge cases proxy", () => {
  beforeEach(async () => {
    router = createTestRouter();

    await router.start("/home");
  });

  afterEach(() => {
    router.stop();

    vi.clearAllMocks();
  });

  describe("edge cases - section 12 analysis", () => {
    describe("throwing getter in opts", () => {
      it("should handle opts with non-throwing getters", async () => {
        const optsWithGetter = {
          get replace(): boolean {
            return true;
          },
        };

        const state = await router.navigate(
          "users",
          {},
          undefined,
          optsWithGetter,
        );

        expect(state).toStrictEqual(expect.objectContaining({ name: "users" }));
        // The getter's `replace: true` must actually be honored — without this
        // the test passed even if the opts object were ignored entirely.
        expect(state.transition?.replace).toBe(true);
      });
    });

    // -------------------------------------------------------------------------
    // 12.2.4: Recursive navigate from callback
    // -------------------------------------------------------------------------

    describe("Proxy objects handling", () => {
      it("should accept Proxy as params (passes isParams if returns valid values)", async () => {
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

        const state = await router.navigate(
          "users.view",
          proxyParams,
          undefined,
          {},
        );

        // Navigation succeeds, using the proxied value
        expect(state).toStrictEqual(
          expect.objectContaining({
            params: expect.objectContaining({ id: 999 }),
          }),
        );
      });

      it("should accept Proxy as opts (no structuredClone)", async () => {
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

        // The navigation passes isNavigationOptions validation (Proxy returns correct values)
        // and Proxy options are now accepted (no structuredClone)
        const state = await router.navigate("users", {}, undefined, proxyOpts);

        expect(state).toStrictEqual(expect.objectContaining({ name: "users" }));
        // The Proxy's `replace: true` must reach the transition — otherwise the
        // test proves only that navigation didn't crash, not that opts were read.
        expect(state.transition?.replace).toBe(true);
      });

      it("should handle plain objects that mimic Proxy behavior", async () => {
        // Plain objects with getters work fine (unlike Proxy)
        const objectWithGetter = {
          get replace(): boolean {
            return true;
          },
        };

        const state = await router.navigate(
          "users",
          {},
          undefined,
          objectWithGetter,
        );

        expect(state).toStrictEqual(
          expect.objectContaining({
            name: "users",
          }),
        );
        expect(state.transition?.replace).toBe(true);
      });
    });
  });
});
