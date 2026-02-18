import { describe, it, expect, vi, beforeEach } from "vitest";

import { StateNamespace } from "../../../../src/namespaces/StateNamespace/StateNamespace";

function setupNamespace(): StateNamespace {
  const ns = new StateNamespace();

  ns.setDependencies({
    getDefaultParams: vi.fn().mockReturnValue({}),
    buildPath: vi.fn().mockImplementation((name: string) => `/${name}`),
    getUrlParams: vi.fn().mockReturnValue([]),
  });

  return ns;
}

describe("StateNamespace/reset", () => {
  let ns: StateNamespace;

  beforeEach(() => {
    ns = setupNamespace();
  });

  it("reset() clears frozenState to undefined", () => {
    const state = ns.makeState("home");

    ns.set(state);

    expect(ns.get()).not.toBeUndefined();

    ns.reset();

    expect(ns.get()).toBeUndefined();
  });

  it("reset() clears previousState to undefined", () => {
    const state1 = ns.makeState("home");
    const state2 = ns.makeState("users");

    ns.set(state1);
    ns.set(state2);

    expect(ns.getPrevious()).not.toBeUndefined();

    ns.reset();

    expect(ns.getPrevious()).toBeUndefined();
  });

  it("reset() resets stateId so next makeState starts fresh", () => {
    const meta = { id: 0, params: {}, options: {}, redirected: false };

    ns.makeState("home", undefined, undefined, meta);
    ns.makeState("users", undefined, undefined, meta);

    ns.reset();

    const state = ns.makeState("admin", undefined, undefined, meta);

    expect(state.meta?.id).toBe(1);
  });

  it("reset() clears urlParamsCache so areStatesEqual still works", () => {
    ns.areStatesEqual(ns.makeState("home"), ns.makeState("home"));

    ns.reset();

    expect(() =>
      ns.areStatesEqual(ns.makeState("home"), ns.makeState("home")),
    ).not.toThrowError();
  });

  it("reset() on empty namespace is safe (no-op)", () => {
    expect(() => {
      ns.reset();
    }).not.toThrowError();
    expect(ns.get()).toBeUndefined();
    expect(ns.getPrevious()).toBeUndefined();
  });

  it("can set state again after reset()", () => {
    const state1 = ns.makeState("home");

    ns.set(state1);
    ns.reset();

    const state2 = ns.makeState("admin");

    ns.set(state2);

    expect(ns.get()?.name).toBe("admin");
  });
});
