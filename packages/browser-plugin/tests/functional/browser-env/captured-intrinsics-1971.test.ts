import { afterEach, describe, expect, it } from "vitest";

import { browserPluginFactory, isState } from "@real-router/browser-plugin";

/**
 * `shared/browser-env` decides with UNCAPTURED intrinsics, and three of them
 * FAIL OPEN (#1971).
 *
 * The doctrine these cells enforce is stated in core's `guards.ts`: *"a guard is
 * only as strong as the intrinsic it reads WHEN IT RUNS, and an application can
 * re-point any of these AFTER boot"*. Core captures in seventeen files;
 * `shared/` captures in none, and carries sixteen raw deciding reads.
 *
 * ⚑ What makes this half worth its own cells rather than a line in the sweep:
 * core's raw reads mostly degrade toward refusal or a wrong-but-loud outcome,
 * while here the guard's verdict flips to **"valid"** for input it exists to
 * reject. Same convention, different severity.
 *
 * ⚠ Honest framing: an attacker who can re-point `Object.getPrototypeOf` already
 * has script execution, so this is not a security boundary. It is robustness
 * against polyfills, RUM/APM instrumentation, browser extensions and test
 * doubles — the case the doctrine itself rests on.
 *
 * ⚠ And the doctrine's own limit, carried over verbatim: capture narrows the
 * window from "any time after boot" to "before core loads". It does not close
 * it — a shim evaluated ahead of the module still wins (#1798).
 */
describe("shared/browser-env decides with captured intrinsics (#1971)", () => {
  const realGetPrototypeOf = Object.getPrototypeOf;
  const realValues = Object.values;
  const realKeys = Object.keys;

  afterEach(() => {
    Object.getPrototypeOf = realGetPrototypeOf;
    Object.values = realValues;
    Object.keys = realKeys;
  });

  const entryWith = (params: unknown): unknown => ({
    name: "users",
    params,
    path: "/users",
  });

  it("refuses a Date in params even when getPrototypeOf is re-pointed", () => {
    const entry = entryWith({ when: new Date() });

    // CONTROL — the guard genuinely refuses this shape, so the cell below
    // measures the intrinsic and not a guard that never worked.
    expect(isState(entry)).toBe(false);

    Object.getPrototypeOf = (() => null) as typeof Object.getPrototypeOf;

    // Every object now looks like a plain container, so `isPlainContainer`
    // waves a class instance through and the Date lands in `state.params`.
    expect(isState(entry)).toBe(false);
  });

  it("refuses a nested function in params even when values is re-pointed", () => {
    const entry = entryWith({ nested: { fn: () => "x" } });

    // CONTROL — refused for real before the shim.
    expect(isState(entry)).toBe(false);

    Object.values = (() => []) as unknown as typeof Object.values;

    // With no children pushed onto the work-stack the walk inspects nothing
    // below the top level, so the function is never seen.
    expect(isState(entry)).toBe(false);
  });

  it("refuses a '..' base even when keys is re-pointed", () => {
    // CONTROL — the rule fires for real.
    expect(() => browserPluginFactory({ base: "/a/../b" })).toThrow(
      /must not contain '\.\.' segments/,
    );

    Object.keys = (() => []) as unknown as typeof Object.keys;

    // The validator's loop is `for (const key of Object.keys(opts))`, so an
    // empty answer validates NOTHING — not this rule, not any other.
    expect(() => browserPluginFactory({ base: "/a/../b" })).toThrow(
      /must not contain '\.\.' segments/,
    );
  });

  it("CONTROL — the shims are genuinely installed and reached", () => {
    // Without this the three cells above could pass by the shim silently
    // failing to take effect, which is indistinguishable from a fix.
    Object.getPrototypeOf = (() => null) as typeof Object.getPrototypeOf;
    Object.values = (() => []) as unknown as typeof Object.values;
    Object.keys = (() => []) as unknown as typeof Object.keys;

    expect(Object.getPrototypeOf({})).toBeNull();
    expect(Object.values({ a: 1 })).toStrictEqual([]);
    expect(Object.keys({ a: 1 })).toStrictEqual([]);
  });
});
