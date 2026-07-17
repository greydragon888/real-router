/**
 * KEEP-narrow white-box exception (see packages/search-params/eslint.config.mjs).
 *
 * `makeOptions` returns the module-level cached `DEFAULT_OPTIONS` **by reference**
 * whenever no option actually changes a format — the allocation-free singleton
 * documented in CLAUDE.md ("No options = the same auto defaults … the lookup is
 * allocation-free (a cached singleton)"). This is the hot path: every `parse`/
 * `build` call with no (or empty) options resolves through it, and the
 * `parse-scale.stress.ts` create→drop leak guard is valid ONLY because these
 * options/strategy singletons are fixed rather than reallocated per call.
 *
 * That identity is a pure MEMORY/PERF invariant a consumer can never observe: the
 * resolved `OptionsWithStrategies` struct is internal and is never handed back
 * through `parse`/`build`. So it cannot be asserted through the public surface —
 * a behavioral test would pass identically against a per-call reallocation. The
 * resolved default VALUES and the partial-override precedence ARE observable and
 * live in search-params.test.ts ("option resolution"); only the object-identity
 * invariant is pinned here, via the internal `makeOptions` import.
 *
 * The twin of path-matcher's createSegmentNode.test.ts (trie-node hidden-class /
 * sentinel memory invariants, #1009/#1379): behavior is covered publicly, the
 * memory shape is pinned directly.
 */
import { describe, it, expect } from "vitest";

// KEEP-narrow: internal cached-singleton perf invariant, unobservable through
// parse/build (see file header). Exempted from the white-box guardrail via the
// eslint.config.mjs `ignores` allowlist, so no inline disable is needed.
import { makeOptions } from "../../../src/search-params/encode";

describe("makeOptions cached-singleton identity (perf invariant)", () => {
  it("returns the SAME cached object for no options and empty options", () => {
    // The no-effective-options fast path (`!opts` and the all-undefined guard)
    // must return one shared instance, not a fresh allocation per call.
    expect(makeOptions()).toBe(makeOptions());
    expect(makeOptions()).toBe(makeOptions({}));
  });

  it("allocates a FRESH object once any format is actually provided", () => {
    // Providing a field (even one equal to its default) fails the all-undefined
    // guard → the else branch allocates. This pins the fast-path boundary: the
    // singleton is reused ONLY when nothing was specified.
    const cached = makeOptions();

    expect(makeOptions({ arrayFormat: "none" })).not.toBe(cached);
    expect(makeOptions({ arrayFormat: "brackets" })).not.toBe(cached);
  });
});
