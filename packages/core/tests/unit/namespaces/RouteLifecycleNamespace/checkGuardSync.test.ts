import { logger } from "@real-router/logger";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { RouteLifecycleNamespace } from "../../../../src/namespaces/RouteLifecycleNamespace/RouteLifecycleNamespace";

import type { Router } from "../../../../src/Router";
import type { ActivationFnFactory } from "../../../../src/types";
import type { State, ActivationFn } from "@real-router/types";

const createState = (name: string): State => ({
  name,
  params: {},
  path: `/${name}`,
  meta: { id: 1, params: {}, options: {}, redirected: false },
});

function setupNamespace(): RouteLifecycleNamespace {
  const ns = new RouteLifecycleNamespace();
  const mockRouter = {} as Router;
  const mockGetDependency = vi.fn();

  ns.setRouter(mockRouter);
  ns.setDependencies({ getDependency: mockGetDependency });

  return ns;
}

describe("RouteLifecycleNamespace/checkActivateGuardSync", () => {
  let ns: RouteLifecycleNamespace;
  let loggerWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    ns = setupNamespace();
    loggerWarnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    loggerWarnSpy.mockRestore();
  });

  it("should return true when no guard is registered", () => {
    const toState = createState("home");
    const fromState = createState("index");

    expect(ns.checkActivateGuardSync("home", toState, fromState)).toBe(true);
  });

  it("should return true when guard returns true (boolean)", () => {
    ns.registerCanActivate("admin", true, false);

    const toState = createState("admin");
    const fromState = createState("home");

    expect(ns.checkActivateGuardSync("admin", toState, fromState)).toBe(true);
  });

  it("should return false when guard returns false (boolean)", () => {
    ns.registerCanActivate("admin", false, false);

    const toState = createState("admin");
    const fromState = createState("home");

    expect(ns.checkActivateGuardSync("admin", toState, fromState)).toBe(false);
  });

  it("should return true when guard returns a state", () => {
    const factory: ActivationFnFactory = () => (_toState) => {
      return _toState;
    };

    ns.registerCanActivate("admin", factory, false);

    const toState = createState("admin");
    const fromState = createState("home");

    expect(ns.checkActivateGuardSync("admin", toState, fromState)).toBe(true);
  });

  it("should return false when guard throws an error", () => {
    const factory: ActivationFnFactory = () => () => {
      throw new Error("CANNOT_ACTIVATE");
    };

    ns.registerCanActivate("admin", factory, false);

    const toState = createState("admin");
    const fromState = createState("home");

    expect(ns.checkActivateGuardSync("admin", toState, fromState)).toBe(false);
  });

  it("should warn and return false when guard returns a Promise", () => {
    const factory: ActivationFnFactory = () => () => Promise.resolve(true);

    ns.registerCanActivate("admin", factory, false);

    const toState = createState("admin");
    const fromState = createState("home");

    expect(ns.checkActivateGuardSync("admin", toState, fromState)).toBe(false);
    expect(loggerWarnSpy).toHaveBeenCalledWith(
      "router.checkActivateGuardSync",
      expect.stringContaining("returned a Promise"),
    );
  });

  it("should return false when guard throws synchronously", () => {
    const factory: ActivationFnFactory = () => () => {
      throw new Error("sync error");
    };

    ns.registerCanActivate("admin", factory, false);

    const toState = createState("admin");
    const fromState = createState("home");

    expect(ns.checkActivateGuardSync("admin", toState, fromState)).toBe(false);
  });

  it("should return true when guard returns a State object (redirect attempt — permissive default)", () => {
    // Guards cannot redirect in canNavigateTo context.
    // A State return is treated as non-boolean, non-Promise → permissive true.
    const factory: ActivationFnFactory = () => (toState) => toState;

    ns.registerCanActivate("admin", factory, false);

    const toState = createState("admin");
    const fromState = createState("home");

    expect(ns.checkActivateGuardSync("admin", toState, fromState)).toBe(true);
    // No warning is emitted — this is intentional (State return is not an error)
    expect(loggerWarnSpy).not.toHaveBeenCalled();
  });

  it("should return false when guard returns a Promise (async guard)", () => {
    // Guard returns a Promise — sync check cannot resolve async guards
    const factory: ActivationFnFactory = () => (_toState) => {
      return new Promise<State>((resolve) => {
        setTimeout(() => {
          resolve(_toState);
        }, 100);
      });
    };

    ns.registerCanActivate("admin", factory, false);

    const toState = createState("admin");
    const fromState = createState("home");

    // Promise returned, so sync check returns false with warning
    expect(ns.checkActivateGuardSync("admin", toState, fromState)).toBe(false);
  });

  it("should pass fromState as undefined when not provided", () => {
    const guardSpy = vi.fn<ActivationFn>((_toState) => {
      return _toState;
    });
    const factory: ActivationFnFactory = () => guardSpy;

    ns.registerCanActivate("admin", factory, false);

    const toState = createState("admin");

    ns.checkActivateGuardSync("admin", toState, undefined);

    expect(guardSpy).toHaveBeenCalledWith(toState, undefined);
  });
});

describe("RouteLifecycleNamespace/checkDeactivateGuardSync", () => {
  let ns: RouteLifecycleNamespace;
  let loggerWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    ns = setupNamespace();
    loggerWarnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    loggerWarnSpy.mockRestore();
  });

  it("should return true when no guard is registered", () => {
    const toState = createState("home");
    const fromState = createState("admin");

    expect(ns.checkDeactivateGuardSync("admin", toState, fromState)).toBe(true);
  });

  it("should return true when guard returns true (boolean)", () => {
    ns.registerCanDeactivate("admin", true, false);

    const toState = createState("home");
    const fromState = createState("admin");

    expect(ns.checkDeactivateGuardSync("admin", toState, fromState)).toBe(true);
  });

  it("should return false when guard returns false (boolean)", () => {
    ns.registerCanDeactivate("admin", false, false);

    const toState = createState("home");
    const fromState = createState("admin");

    expect(ns.checkDeactivateGuardSync("admin", toState, fromState)).toBe(
      false,
    );
  });

  it("should return true when guard returns a state", () => {
    const factory: ActivationFnFactory = () => (_toState) => {
      return _toState;
    };

    ns.registerCanDeactivate("admin", factory, false);

    const toState = createState("home");
    const fromState = createState("admin");

    expect(ns.checkDeactivateGuardSync("admin", toState, fromState)).toBe(true);
  });

  it("should return false when guard throws an error", () => {
    const factory: ActivationFnFactory = () => () => {
      throw new Error("CANNOT_DEACTIVATE");
    };

    ns.registerCanDeactivate("admin", factory, false);

    const toState = createState("home");
    const fromState = createState("admin");

    expect(ns.checkDeactivateGuardSync("admin", toState, fromState)).toBe(
      false,
    );
  });

  it("should warn and return false when guard returns a Promise", () => {
    const factory: ActivationFnFactory = () => () => Promise.resolve(true);

    ns.registerCanDeactivate("admin", factory, false);

    const toState = createState("home");
    const fromState = createState("admin");

    expect(ns.checkDeactivateGuardSync("admin", toState, fromState)).toBe(
      false,
    );
    expect(loggerWarnSpy).toHaveBeenCalledWith(
      "router.checkDeactivateGuardSync",
      expect.stringContaining("returned a Promise"),
    );
  });

  it("should return false when guard throws synchronously", () => {
    const factory: ActivationFnFactory = () => () => {
      throw new Error("sync error");
    };

    ns.registerCanDeactivate("admin", factory, false);

    const toState = createState("home");
    const fromState = createState("admin");

    expect(ns.checkDeactivateGuardSync("admin", toState, fromState)).toBe(
      false,
    );
  });
});
