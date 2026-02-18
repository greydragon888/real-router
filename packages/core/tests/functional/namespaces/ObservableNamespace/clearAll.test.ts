import { describe, it, expect, vi, beforeEach } from "vitest";

import { events } from "../../../../src/constants";
import { ObservableNamespace } from "../../../../src/namespaces/ObservableNamespace/ObservableNamespace";

describe("ObservableNamespace/clearAll", () => {
  let ns: ObservableNamespace;

  beforeEach(() => {
    ns = new ObservableNamespace();
  });

  it("clears all event listeners after clearAll()", () => {
    const cb = vi.fn();

    ns.addEventListener(events.ROUTER_START, cb);
    ns.addEventListener(events.TRANSITION_SUCCESS, vi.fn());

    ns.clearAll();

    expect(ns.hasListeners(events.ROUTER_START)).toBe(false);
    expect(ns.hasListeners(events.TRANSITION_SUCCESS)).toBe(false);
  });

  it("clearAll() on empty namespace is safe (no-op)", () => {
    expect(() => {
      ns.clearAll();
    }).not.toThrowError();
  });

  it("can add listeners again after clearAll()", () => {
    const cb = vi.fn();

    ns.addEventListener(events.ROUTER_START, cb);
    ns.clearAll();

    expect(() =>
      ns.addEventListener(events.ROUTER_START, cb),
    ).not.toThrowError();
    expect(ns.hasListeners(events.ROUTER_START)).toBe(true);
  });

  it("resets eventDepthMap to null (emit still works after clearAll)", () => {
    const cb = vi.fn();

    ns.addEventListener(events.ROUTER_START, cb);
    ns.emitRouterStart();

    ns.clearAll();

    expect(() => {
      ns.emitRouterStart();
    }).not.toThrowError();
  });
});
