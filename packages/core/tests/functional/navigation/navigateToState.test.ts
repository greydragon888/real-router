import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { createRouter } from "@real-router/core";

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
      void router.navigateToState(null as never, undefined, {});
    }).toThrowError(TypeError);
    expect(() => {
      void router.navigateToState(null as never, undefined, {});
    }).toThrowError(/Invalid toState/);
  });

  it("should throw TypeError for invalid toState (missing name)", () => {
    expect(() => {
      void router.navigateToState({ path: "/" } as never, undefined, {});
    }).toThrowError(TypeError);
  });

  it("should throw TypeError for invalid toState (missing path)", () => {
    expect(() => {
      void router.navigateToState({ name: "home" } as never, undefined, {});
    }).toThrowError(TypeError);
  });

  it("should throw TypeError for invalid fromState", () => {
    const toState = router.makeState("home", {}, "/");

    expect(() => {
      void router.navigateToState(toState, "invalid" as never, {});
    }).toThrowError(TypeError);
    expect(() => {
      void router.navigateToState(toState, { notAState: true } as never, {});
    }).toThrowError(/Invalid fromState/);
  });

  it("should throw TypeError for invalid opts (null)", () => {
    const toState = router.makeState("home", {}, "/");

    expect(() => {
      void router.navigateToState(toState, undefined, null as never);
    }).toThrowError(TypeError);
    expect(() => {
      void router.navigateToState(toState, undefined, null as never);
    }).toThrowError(/Invalid opts/);
  });

  it("should accept valid arguments", async () => {
    const toState = router.makeState("home", {}, "/");
    const fromState = router.getState();

    const result = await router.navigateToState(toState, fromState, {});

    expect(result).toBeDefined();
  });

  it("should accept undefined fromState", async () => {
    const toState = router.makeState("home", {}, "/");

    const result = await router.navigateToState(toState, undefined, {});

    expect(result).toBeDefined();
  });
});
