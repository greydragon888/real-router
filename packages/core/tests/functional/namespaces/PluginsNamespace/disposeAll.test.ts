import { describe, it, expect, vi, beforeEach } from "vitest";

import { PluginsNamespace } from "../../../../src/namespaces/PluginsNamespace/PluginsNamespace";

import type { Router } from "../../../../src/Router";
import type { PluginFactory } from "../../../../src/types";

function setupNamespace(): PluginsNamespace {
  const ns = new PluginsNamespace();
  const mockRouter = {} as Router;
  const mockGetDependency = vi.fn();
  const mockAddEventListener = vi.fn().mockReturnValue(() => {});
  const mockCanNavigate = vi.fn().mockReturnValue(false);

  ns.setRouter(mockRouter);
  ns.setDependencies({
    getDependency: mockGetDependency,
    addEventListener: mockAddEventListener,
    canNavigate: mockCanNavigate,
  });

  return ns;
}

function createTeardownPlugin(): {
  factory: PluginFactory;
  teardownCalls: number[];
} {
  const teardownCalls: number[] = [];
  let callCount = 0;

  const factory: PluginFactory = () => ({
    teardown: () => {
      teardownCalls.push(++callCount);
    },
  });

  return { factory, teardownCalls };
}

describe("PluginsNamespace/disposeAll", () => {
  let ns: PluginsNamespace;

  beforeEach(() => {
    ns = setupNamespace();
  });

  it("clears all plugins after disposeAll()", () => {
    const plugin1 = createTeardownPlugin();
    const plugin2 = createTeardownPlugin();

    ns.use(plugin1.factory);
    ns.use(plugin2.factory);

    expect(ns.count()).toBe(2);

    ns.disposeAll();

    expect(ns.count()).toBe(0);
  });

  it("calls teardown on all plugins during disposeAll()", () => {
    const plugin1 = createTeardownPlugin();
    const plugin2 = createTeardownPlugin();

    ns.use(plugin1.factory);
    ns.use(plugin2.factory);

    ns.disposeAll();

    expect(plugin1.teardownCalls).toHaveLength(1);
    expect(plugin2.teardownCalls).toHaveLength(1);
  });

  it("does NOT double-teardown when plugin was manually unsubscribed before disposeAll()", () => {
    const plugin = createTeardownPlugin();

    const unsubscribe = ns.use(plugin.factory);

    unsubscribe();

    expect(plugin.teardownCalls).toHaveLength(1);

    ns.disposeAll();

    expect(plugin.teardownCalls).toHaveLength(1);
  });

  it("isolates errors — error in one plugin teardown does not block others", () => {
    const goodPlugin = createTeardownPlugin();
    const errorFactory: PluginFactory = () => ({
      teardown: () => {
        throw new Error("teardown error");
      },
    });

    ns.use(errorFactory);
    ns.use(goodPlugin.factory);

    // Should not throw
    expect(() => {
      ns.disposeAll();
    }).not.toThrowError();

    expect(goodPlugin.teardownCalls).toHaveLength(1);
  });

  it("disposeAll() on empty namespace is safe (no-op)", () => {
    expect(() => {
      ns.disposeAll();
    }).not.toThrowError();
    expect(ns.count()).toBe(0);
  });

  it("handles batch-registered plugins correctly", () => {
    const plugin1 = createTeardownPlugin();
    const plugin2 = createTeardownPlugin();

    ns.use(plugin1.factory, plugin2.factory);

    expect(ns.count()).toBe(2);

    ns.disposeAll();

    expect(ns.count()).toBe(0);
    expect(plugin1.teardownCalls).toHaveLength(1);
    expect(plugin2.teardownCalls).toHaveLength(1);
  });

  it("after disposeAll(), plugins can be re-registered", () => {
    const plugin = createTeardownPlugin();

    ns.use(plugin.factory);
    ns.disposeAll();

    ns.use(plugin.factory);

    expect(ns.count()).toBe(1);
  });
});
