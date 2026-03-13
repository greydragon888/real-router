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
    }).not.toThrowError();

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
    }).not.toThrowError();

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
    }).not.toThrowError();
  });

  it("unsubscribe after dispose does not throw (idx -1 branch)", () => {
    const unsub = api.extendRouter({ orphan: 1 });

    router.dispose();

    expect(() => {
      unsub();
    }).not.toThrowError();
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
});
