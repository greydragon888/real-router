// An option key that is not an option must be SKIPPED, whatever it is called
// (#1838).
//
// `validateOptions` walked `defaults` with `key in defaults`, and `defaults` is
// a plain object literal — so every own member of `Object.prototype` answered
// the test and was then type-checked against the inherited method it found.
// Measured before the fix, through `browserPluginFactory`:
//
//   nonsenseKey  accepted (skipped as unknown)   ← the intended behaviour
//   toString     THROWS  Invalid type for 'toString': expected function, got string
//   __proto__    THROWS  Invalid type for '__proto__': expected object, got string
//
// All twelve threw. The asymmetry is the defect: a typo'd option is forgiven and
// a typo that happens to collide with a prototype member is a hard error about
// a type the caller never declared.

import { describe, expect, it } from "vitest";

import { browserPluginFactory } from "../../../src";

/** Derived, not listed — a hand-written list stops covering a member the runtime adds. */
const PROTOTYPE_MEMBERS = Object.getOwnPropertyNames(Object.prototype);

describe("unknown option keys are skipped whatever they are called (#1838)", () => {
  it("CONTROL — the derived member list is populated", () => {
    // Without this the `each` below silently registers zero cells.
    expect(PROTOTYPE_MEMBERS.length).toBeGreaterThanOrEqual(12);
    expect(PROTOTYPE_MEMBERS).toContain("toString");
  });

  it.each(PROTOTYPE_MEMBERS)("`%s` is skipped, not type-checked", (key) => {
    expect(() => browserPluginFactory({ [key]: "str" })).not.toThrow();
  });

  it("CONTROL — a genuinely unknown key was always skipped", () => {
    // The other half of the asymmetry, and the proof the fix did not simply
    // switch everything off: this cell passed before the fix too.
    expect(() =>
      browserPluginFactory({ nonsenseKey: "str" } as never),
    ).not.toThrow();
  });

  it("CONTROL — a REAL option with a wrong type still throws", () => {
    // The guard must still guard. Without this cell, `if (false)` would pass
    // every cell above.
    expect(() => browserPluginFactory({ base: 42 } as never)).toThrow(
      /Invalid type for 'base'/,
    );
  });
});
