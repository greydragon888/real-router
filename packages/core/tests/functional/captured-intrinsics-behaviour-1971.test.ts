import { afterEach, describe, expect, it } from "vitest";

import { copyFields, putField } from "@real-router/core/utils";

/**
 * The BEHAVIOURAL half of #1971 — what the capture actually buys in core.
 *
 * `captured-intrinsics-authority-1971` derives the site set and proves no raw
 * read remains; it says nothing about what a raw read would have DONE. This file
 * is the other half, and it exists because the sweep's own reproduction was run
 * once, before the fix, and then deleted: a defect measured but never pinned is
 * a defect the next refactor restores in silence.
 *
 * ⚑ The subject is `copyFields`, published through `@real-router/core/utils`
 * "because the rule is the plugin author's too" — and the file it lives in,
 * `utils/ingest.ts`, OWNS the write discipline: it captured `defineProperty` and
 * `hasOwn` at module load and then walked a caller's bag with the uncaptured
 * `Object.entries` two hundred lines below, both in the same commit (#1852).
 *
 * ⚠ Not a security boundary: re-pointing `Object.entries` already requires
 * script execution. It is robustness against polyfills, RUM/APM instrumentation,
 * browser extensions and test doubles.
 */
describe("core's deciding intrinsics are captured — behaviour (#1971)", () => {
  const realEntries = Object.entries;
  const realHasOwn = Object.hasOwn;

  afterEach(() => {
    Object.entries = realEntries;
    Object.hasOwn = realHasOwn;
    delete (Object.prototype as Record<string, unknown>).hijacked;
  });

  it("copyFields keeps every key when Object.entries is re-pointed", () => {
    // CONTROL — the copy is complete before any shim, so the cell below measures
    // the intrinsic and not a helper that never worked.
    const healthy: Record<string, unknown> = {};

    copyFields(healthy, { id: "7", tab: "a" });

    expect(healthy).toStrictEqual({ id: "7", tab: "a" });

    // A polyfill need not be malicious to do this — any shim that mishandles a
    // shape drops entries the same way. Measured before the capture:
    // `{"id":"7","tab":"a"}` came back as `{"tab":"a"}`, silently: no throw, no
    // warning, and the bag reported as copied.
    Object.entries = ((o: Record<string, unknown>) =>
      realEntries(o).slice(1)) as typeof Object.entries;

    const shimmed: Record<string, unknown> = {};

    copyFields(shimmed, { id: "7", tab: "a" });

    expect(shimmed).toStrictEqual({ id: "7", tab: "a" });
  });

  it("CONTROL — the shim is genuinely installed and would have dropped a key", () => {
    // Without this the cell above passes if the shim silently fails to take
    // effect, which is indistinguishable from a capture that works.
    Object.entries = ((o: Record<string, unknown>) =>
      realEntries(o).slice(1)) as typeof Object.entries;

    expect(Object.entries({ id: "7", tab: "a" })).toStrictEqual([["tab", "a"]]);
  });

  it("putField still refuses an ambient setter when hasOwn is re-pointed", () => {
    // The sibling half of the same file, captured since #1852 and pinned here
    // because the sweep's reproduction used it as its discriminator: with
    // `Object.hasOwn` shimmed in the same process, the captured form still
    // defines the own key and the foreign setter never runs.
    let foreignSetterRan = false;

    Object.defineProperty(Object.prototype, "hijacked", {
      configurable: true,
      set() {
        foreignSetterRan = true;
      },
    });

    Object.hasOwn = () => false;

    const guarded: Record<string, unknown> = {};

    putField(guarded, "hijacked", "value");

    expect(realHasOwn(guarded, "hijacked")).toBe(true);
    expect(foreignSetterRan).toBe(false);
  });
});
