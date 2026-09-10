import { afterEach, describe, expect, it, vi } from "vitest";

import { browserPluginFactory, isState } from "@real-router/browser-plugin";

/**
 * `shared/browser-env` keeps deciding correctly when the intrinsics it decides
 * with are re-pointed after boot (#1971).
 *
 * The doctrine these cells enforce is stated in core's `guards.ts`: *"a guard is
 * only as strong as the intrinsic it reads WHEN IT RUNS, and an application can
 * re-point any of these AFTER boot"*. The census of who captures and who reads
 * raw belongs to core's `captured-intrinsics-authority-1971`, which derives it;
 * these cells own the BEHAVIOUR on the reads this file still names.
 *
 * ⚑ What makes this half worth its own cells rather than a line in the sweep:
 * a raw read in core mostly degrades toward refusal or a wrong-but-loud
 * outcome, while a raw read HERE flips the guard's verdict to **"valid"** for
 * input it exists to reject. Same convention, different severity — which is why
 * these three are pinned by behaviour and not only by the scan.
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
    // The premise cell below loads the module afresh under a shim; leaving that
    // copy in the registry would hand it to whatever imports next.
    vi.resetModules();
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

    Object.values = (() => []) as typeof Object.values;

    // With no children pushed onto the work-stack the walk inspects nothing
    // below the top level, so the function is never seen.
    expect(isState(entry)).toBe(false);
  });

  it("refuses a '..' base even when keys is re-pointed", () => {
    // CONTROL — the rule fires for real.
    expect(() => browserPluginFactory({ base: "/a/../b" })).toThrow(
      /must not contain '\.\.' segments/,
    );

    Object.keys = () => [];

    // The validator's loop is `for (const key of Object.keys(opts))`, so an
    // empty answer validates NOTHING — not this rule, not any other.
    expect(() => browserPluginFactory({ base: "/a/../b" })).toThrow(
      /must not contain '\.\.' segments/,
    );
  });

  it("without the capture the guard DISAPPEARS — the premise capture answers", async () => {
    // The cells above pin what capture BUYS. This one pins WHY it is there, and
    // it is the only arm that produces the outcome the docblock describes: the
    // shim has to be installed AHEAD of the module's load, so the capture takes
    // the lie. Re-pointing after boot — the three cells above — is exactly the
    // window capture closed.
    //
    // ⚑ Executable form of the doctrine's own caveat: capture narrows the
    // window to "before this module loads" and does not close it (#1798).
    vi.resetModules();
    Object.keys = () => [];

    const poisoned = (await import("../../../src/validation.js")) as {
      validateOptions: (opts: unknown) => void;
    };

    Object.keys = realKeys;

    expect(() => {
      poisoned.validateOptions({ base: "/a/../b" });
    }).not.toThrow();

    // CONTROL — the same module under a clean `Object.keys` refuses, so the
    // arm above measures the shim and not a validator that never worked.
    vi.resetModules();

    const clean = (await import("../../../src/validation.js")) as {
      validateOptions: (opts: unknown) => void;
    };

    expect(() => {
      clean.validateOptions({ base: "/a/../b" });
    }).toThrow(/must not contain '\.\.' segments/);
  });

  it("CONTROL — the shims are genuinely installed and reached", () => {
    // Without this the three cells above could pass by the shim silently
    // failing to take effect, which is indistinguishable from a fix.
    Object.getPrototypeOf = (() => null) as typeof Object.getPrototypeOf;
    Object.values = (() => []) as typeof Object.values;
    Object.keys = () => [];

    expect(Object.getPrototypeOf({})).toBeNull();
    expect(Object.values({ a: 1 })).toStrictEqual([]);
    expect(Object.keys({ a: 1 })).toStrictEqual([]);
  });
});
