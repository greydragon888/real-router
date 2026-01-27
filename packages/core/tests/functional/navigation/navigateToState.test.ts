import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { createRouter } from "@real-router/core";

import type { Router } from "@real-router/core";

let router: Router;

describe("navigateToState argument validation", () => {
  beforeEach(() => {
    router = createRouter([{ name: "home", path: "/" }]);
    router.start("/");
  });

  afterEach(() => {
    router.stop();
  });

  it("should throw TypeError for invalid toState (null)", () => {
    expect(() => {
      router.navigateToState(null as never, undefined, {}, () => {}, true);
    }).toThrowError(TypeError);
    expect(() => {
      router.navigateToState(null as never, undefined, {}, () => {}, true);
    }).toThrowError(/Invalid toState/);
  });

  it("should throw TypeError for invalid toState (missing name)", () => {
    expect(() => {
      router.navigateToState(
        { path: "/" } as never,
        undefined,
        {},
        () => {},
        true,
      );
    }).toThrowError(TypeError);
  });

  it("should throw TypeError for invalid toState (missing path)", () => {
    expect(() => {
      router.navigateToState(
        { name: "home" } as never,
        undefined,
        {},
        () => {},
        true,
      );
    }).toThrowError(TypeError);
  });

  it("should throw TypeError for invalid fromState", () => {
    const toState = router.makeState("home", {}, "/");

    expect(() => {
      router.navigateToState(toState, "invalid" as never, {}, () => {}, true);
    }).toThrowError(TypeError);
    expect(() => {
      router.navigateToState(
        toState,
        { notAState: true } as never,
        {},
        () => {},
        true,
      );
    }).toThrowError(/Invalid fromState/);
  });

  it("should throw TypeError for invalid opts (null)", () => {
    const toState = router.makeState("home", {}, "/");

    expect(() => {
      router.navigateToState(toState, undefined, null as never, () => {}, true);
    }).toThrowError(TypeError);
    expect(() => {
      router.navigateToState(toState, undefined, null as never, () => {}, true);
    }).toThrowError(/Invalid opts/);
  });

  it("should throw TypeError for invalid callback", () => {
    const toState = router.makeState("home", {}, "/");

    expect(() => {
      router.navigateToState(
        toState,
        undefined,
        {},
        "not-a-function" as never,
        true,
      );
    }).toThrowError(TypeError);
    expect(() => {
      router.navigateToState(toState, undefined, {}, 123 as never, true);
    }).toThrowError(/Invalid callback/);
  });

  it("should throw TypeError for invalid emitSuccess", () => {
    const toState = router.makeState("home", {}, "/");

    expect(() => {
      router.navigateToState(toState, undefined, {}, () => {}, "true" as never);
    }).toThrowError(TypeError);
    expect(() => {
      router.navigateToState(toState, undefined, {}, () => {}, 1 as never);
    }).toThrowError(/Invalid emitSuccess/);
  });

  it("should accept valid arguments", () => {
    const toState = router.makeState("home", {}, "/");
    const fromState = router.getState();

    expect(() => {
      router.navigateToState(toState, fromState, {}, () => {}, true);
    }).not.toThrowError();
  });

  it("should accept undefined fromState", () => {
    const toState = router.makeState("home", {}, "/");

    expect(() => {
      router.navigateToState(toState, undefined, {}, () => {}, false);
    }).not.toThrowError();
  });
});
