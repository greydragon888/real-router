import { describe, it, expect, vi, beforeEach } from "vitest";

import { MiddlewareNamespace } from "../../../../src/namespaces/MiddlewareNamespace/MiddlewareNamespace";

import type { Router } from "../../../../src/Router";
import type { MiddlewareFactory } from "../../../../src/types";

function setupNamespace(): MiddlewareNamespace {
  const ns = new MiddlewareNamespace();
  const mockRouter = {} as Router;
  const mockGetDependency = vi.fn();

  ns.setRouter(mockRouter);
  ns.setDependencies({ getDependency: mockGetDependency });

  return ns;
}

const middlewareFactory1: MiddlewareFactory = () => () => true;
const middlewareFactory2: MiddlewareFactory = () => () => true;

describe("MiddlewareNamespace/clearAll", () => {
  let ns: MiddlewareNamespace;

  beforeEach(() => {
    ns = setupNamespace();
  });

  it("clears all factories after clearAll()", () => {
    const initialized = ns.initialize(middlewareFactory1, middlewareFactory2);

    ns.commit(initialized);

    expect(ns.count()).toBe(2);

    ns.clearAll();

    expect(ns.count()).toBe(0);
  });

  it("clears factoryToMiddleware lookup after clearAll()", () => {
    const initialized = ns.initialize(middlewareFactory1);

    ns.commit(initialized);

    expect(ns.getFunctions()).toHaveLength(1);

    ns.clearAll();

    expect(ns.getFunctions()).toHaveLength(0);
  });

  it("clearAll() on empty namespace is safe (no-op)", () => {
    expect(() => {
      ns.clearAll();
    }).not.toThrowError();
    expect(ns.count()).toBe(0);
  });

  it("can register middleware again after clearAll()", () => {
    const initialized = ns.initialize(middlewareFactory1);

    ns.commit(initialized);
    ns.clearAll();

    const initialized2 = ns.initialize(middlewareFactory1);

    ns.commit(initialized2);

    expect(ns.count()).toBe(1);
  });
});
