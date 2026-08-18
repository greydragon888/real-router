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
import {
  DEFAULT_QUERY_PARAMS,
  makeOptions,
} from "../../../../src/engine/search-params/encode";

describe("makeOptions cached-singleton identity (perf invariant)", () => {
  it("returns the SAME cached object for no options and empty options", () => {
    // The no-effective-options fast path (`!opts` and the all-undefined guard)
    // must return one shared instance, not a fresh allocation per call.
    expect(makeOptions()).toBe(makeOptions());
    expect(makeOptions()).toBe(makeOptions({}));
  });

  it("the shared singleton is FROZEN, and so are the two defaults behind it", () => {
    // The other half of "returns it BY REFERENCE": a shared object handed back to
    // callers must be immutable, or it is a process-global every default-configured
    // router can corrupt — the #897 class (`LEVEL_CONFIGS` exported unfrozen
    // corrupted the global log threshold). Nothing in the engine mutates these
    // three; the freeze makes that structural instead of conventional.
    //
    // ⚑ It also removes an ORDER DEPENDENCE. `OptionsNamespace` deep-freezes the
    // router's options, and its defaults reference `DEFAULT_QUERY_PARAMS`, so
    // before this the FIRST `createRouter` froze the module singleton as a side
    // effect: `Object.isFrozen` answered `false` in a process that had not built a
    // router and `true` in one that had. Asserted here, in a file that constructs
    // no router, so the answer cannot be supplied by that side effect.
    const cached = makeOptions();

    expect(Object.isFrozen(cached)).toBe(true);
    expect(Object.isFrozen(cached.strategies)).toBe(true);
    expect(Object.isFrozen(DEFAULT_QUERY_PARAMS)).toBe(true);

    // Writes are refused rather than silently dropped: the module runs under ESM,
    // so a strict-mode assignment to a frozen field throws.
    expect(() => {
      (cached as unknown as Record<string, unknown>).numberFormat = "HIJACKED";
    }).toThrow(TypeError);

    expect(makeOptions().numberFormat).toBe("auto");
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
