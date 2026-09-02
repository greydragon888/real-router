import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { errorCodes, RouterError } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

import { createTestRouter } from "../../../helpers";

import type { Router } from "@real-router/core";
import type { PluginApi } from "@real-router/core/api";

let router: Router;
let api: PluginApi;

describe("getPluginApi().extendRouter()", () => {
  beforeEach(() => {
    router = createTestRouter();
    api = getPluginApi(router);
  });

  afterEach(() => {
    if (router.isActive()) {
      router.stop();
    }
  });

  it("adds properties to router", () => {
    api.extendRouter({ foo: 42 });

    expect((router as Record<string, unknown>).foo).toBe(42);
  });

  it("unsubscribe removes properties", () => {
    const unsub = api.extendRouter({ foo: 42 });

    expect("foo" in router).toBe(true);

    unsub();

    expect("foo" in router).toBe(false);
  });

  it("unsubscribe is idempotent", () => {
    const unsub = api.extendRouter({ foo: 42 });

    unsub();

    expect(() => {
      unsub();
    }).not.toThrow();

    expect("foo" in router).toBe(false);
  });

  it("throws PLUGIN_CONFLICT for built-in property", () => {
    let caught: RouterError | undefined;

    try {
      api.extendRouter({ navigate: () => {} });
    } catch (error) {
      caught = error as RouterError;
    }

    expect(caught).toBeInstanceOf(RouterError);
    expect(caught!.code).toBe(errorCodes.PLUGIN_CONFLICT);
  });

  it("throws PLUGIN_CONFLICT for cross-plugin conflict", () => {
    const api2 = getPluginApi(router);

    api.extendRouter({ foo: 1 });

    let caught: RouterError | undefined;

    try {
      api2.extendRouter({ foo: 2 });
    } catch (error) {
      caught = error as RouterError;
    }

    expect(caught).toBeInstanceOf(RouterError);
    expect(caught!.code).toBe(errorCodes.PLUGIN_CONFLICT);
  });

  it("conflict resolves after unsubscribe", () => {
    const api2 = getPluginApi(router);

    const unsub = api.extendRouter({ foo: 1 });

    unsub();

    expect(() => {
      api2.extendRouter({ foo: 2 });
    }).not.toThrow();

    expect((router as Record<string, unknown>).foo).toBe(2);
  });

  it("throws ROUTER_DISPOSED after dispose", () => {
    router.dispose();

    let caught: RouterError | undefined;

    try {
      api.extendRouter({});
    } catch (error) {
      caught = error as RouterError;
    }

    expect(caught).toBeInstanceOf(RouterError);
    expect(caught!.code).toBe(errorCodes.ROUTER_DISPOSED);
  });

  it("dispose() cleans remaining extensions", () => {
    api.extendRouter({ testProp: 42 });

    expect("testProp" in router).toBe(true);

    router.dispose();

    expect("testProp" in router).toBe(false);
  });

  it("multiple extendRouter calls with different keys — all accessible", () => {
    api.extendRouter({ alpha: 1 });
    api.extendRouter({ beta: 2 });

    expect((router as Record<string, unknown>).alpha).toBe(1);
    expect((router as Record<string, unknown>).beta).toBe(2);
  });

  it("empty extensions object — returns valid unsubscribe", () => {
    expect(() => {
      const unsub = api.extendRouter({});

      unsub();
    }).not.toThrow();
  });

  it("unsubscribe after dispose does not throw (idx -1 branch)", () => {
    const unsub = api.extendRouter({ orphan: 1 });

    router.dispose();

    expect(() => {
      unsub();
    }).not.toThrow();
  });

  it("extension values: functions, primitives, objects — all work", () => {
    const fn = () => "hello";
    const obj = { x: 1 };

    api.extendRouter({
      myFn: fn,
      myNum: 99,
      myStr: "world",
      myObj: obj,
      myBool: true,
    });

    const r = router as Record<string, unknown>;

    expect(r.myFn).toBe(fn);
    expect(r.myNum).toBe(99);
    expect(r.myStr).toBe("world");
    expect(r.myObj).toBe(obj);
    expect(r.myBool).toBe(true);
  });

  it("multi-key extend with one conflicting key assigns NONE (atomic)", () => {
    // All keys are checked for conflict before any is assigned, so a single
    // conflict (`navigate` is built-in) aborts the whole call — the valid
    // `freshKey` is NOT added (all-or-nothing).
    let caught: RouterError | undefined;

    try {
      api.extendRouter({ freshKey: 1, navigate: () => {} });
    } catch (error) {
      caught = error as RouterError;
    }

    expect(caught).toBeInstanceOf(RouterError);
    expect(caught!.code).toBe(errorCodes.PLUGIN_CONFLICT);
    expect("freshKey" in router).toBe(false);
  });

  it("blocks prototype-polluting keys (__proto__/constructor/toString) via conflict detection", () => {
    // Computed keys create OWN enumerable props named __proto__/constructor/
    // toString (unlike the `__proto__:` literal, which sets the prototype). All
    // three are `in router` via the Object.prototype chain → PLUGIN_CONFLICT, so
    // none is ever assigned and the global prototype stays clean.
    for (const key of ["__proto__", "constructor", "toString"]) {
      let caught: RouterError | undefined;

      try {
        api.extendRouter({ [key]: { polluted: "yes" } });
      } catch (error) {
        caught = error as RouterError;
      }

      expect(caught).toBeInstanceOf(RouterError);
      expect(caught!.code).toBe(errorCodes.PLUGIN_CONFLICT);
    }

    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  describe("a throwing getter installs nothing (#1933)", () => {
    /**
     * The bag reads as `{ alpha, beta (throws), gamma }`.
     *
     * ⚠ NOT `throwingBag` from `hostileBags`, and that is measured rather than a
     * preference: it throws on EVERY key, so the FIRST read aborts and there is
     * nothing installed to leak. The defect needs an earlier key to succeed.
     */
    const partialThrower = (
      boom: Error,
    ): { bag: Record<string, unknown>; reads: () => string[] } => {
      const reads: string[] = [];
      const bag = {};

      for (const key of ["alpha", "beta", "gamma"]) {
        Object.defineProperty(bag, key, {
          enumerable: true,
          configurable: true,
          get(): unknown {
            reads.push(key);

            if (key === "beta") {
              throw boom;
            }

            return () => key;
          },
        });
      }

      return { bag, reads: () => reads };
    };

    it("leaves the router untouched, and the names claimable again", () => {
      const boom = new Error("getter says no");
      const { bag, reads } = partialThrower(boom);

      expect(() => {
        api.extendRouter(bag);
      }).toThrow(boom);

      const asRecord = router as unknown as Record<string, unknown>;

      // The whole failure: `alpha` is read BEFORE `beta` throws, so a
      // read-and-write loop has already installed it — untracked, so no
      // unsubscribe and no dispose() ever removes it, and the name is refused
      // to every later plugin for the life of the router.
      expect(
        { alpha: "alpha" in asRecord, gamma: "gamma" in asRecord },
        "a partial install is still an install",
      ).toStrictEqual({ alpha: false, gamma: false });

      // The user-visible harm, asked directly rather than through internals.
      expect(() => {
        api.extendRouter({ alpha: () => "later plugin" });
      }).not.toThrow();

      expect(asRecord.alpha).toBeTypeOf("function");

      // CONTROL — the reads really reached the throwing key, so the two
      // assertions above are about a bag that got that far rather than one the
      // conflict check refused up front.
      expect(reads()).toStrictEqual(["alpha", "beta"]);
    });

    it("CONTROL — the same bag without the throw installs all three", () => {
      api.extendRouter({
        alpha: () => "a",
        beta: () => "b",
        gamma: () => "c",
      });

      const asRecord = router as unknown as Record<string, unknown>;

      expect({
        alpha: typeof asRecord.alpha,
        beta: typeof asRecord.beta,
        gamma: typeof asRecord.gamma,
      }).toStrictEqual({
        alpha: "function",
        beta: "function",
        gamma: "function",
      });
    });
  });
});
