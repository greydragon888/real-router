import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { createRouter, getPluginApi } from "@real-router/core";

import type { Router } from "@real-router/core";

let router: Router;

describe("navigateToState argument validation", () => {
  beforeEach(async () => {
    router = createRouter([{ name: "home", path: "/" }]);
    await router.start("/");
  });

  afterEach(() => {
    router.stop();
  });

  it("should throw TypeError for invalid toState (null)", () => {
    expect(() => {
      void getPluginApi(router).navigateToState(null as never, undefined, {});
    }).toThrowError(TypeError);
    expect(() => {
      void getPluginApi(router).navigateToState(null as never, undefined, {});
    }).toThrowError(/Invalid toState/);
  });

  it("should throw TypeError for invalid toState (missing name)", () => {
    expect(() => {
      void getPluginApi(router).navigateToState(
        { path: "/" } as never,
        undefined,
        {},
      );
    }).toThrowError(TypeError);
  });

  it("should throw TypeError for invalid toState (missing path)", () => {
    expect(() => {
      void getPluginApi(router).navigateToState(
        { name: "home" } as never,
        undefined,
        {},
      );
    }).toThrowError(TypeError);
  });

  it("should throw TypeError for invalid fromState", () => {
    const toState = getPluginApi(router).makeState("home", {}, "/");

    expect(() => {
      void getPluginApi(router).navigateToState(
        toState,
        "invalid" as never,
        {},
      );
    }).toThrowError(TypeError);
    expect(() => {
      void getPluginApi(router).navigateToState(
        toState,
        { notAState: true } as never,
        {},
      );
    }).toThrowError(/Invalid fromState/);
  });

  it("should throw TypeError for invalid opts (null)", () => {
    const toState = getPluginApi(router).makeState("home", {}, "/");

    expect(() => {
      void getPluginApi(router).navigateToState(
        toState,
        undefined,
        null as never,
      );
    }).toThrowError(TypeError);
    expect(() => {
      void getPluginApi(router).navigateToState(
        toState,
        undefined,
        null as never,
      );
    }).toThrowError(/Invalid opts/);
  });

  it("should accept valid arguments", async () => {
    const toState = getPluginApi(router).makeState("home", {}, "/");
    const fromState = router.getState();

    const result = await getPluginApi(router).navigateToState(
      toState,
      fromState,
      {},
    );

    expect(result).toBeDefined();
  });

  it("should accept undefined fromState", async () => {
    const toState = getPluginApi(router).makeState("home", {}, "/");

    const result = await getPluginApi(router).navigateToState(
      toState,
      undefined,
      {},
    );

    expect(result).toBeDefined();
  });
});
