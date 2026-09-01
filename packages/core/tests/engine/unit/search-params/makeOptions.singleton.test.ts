/**
 * KEEP-narrow white-box exception (see packages/core/eslint.config.mjs — the
 * standalone `search-params` package this header used to name folded into core
 * at #1510).
 *
 * `makeOptions` returns the module-level cached `DEFAULT_OPTIONS` **by reference**
 * whenever no option actually changes a format — an allocation-free cached
 * singleton. (This line used to present that description as a CLAUDE.md
 * QUOTATION; the sentence it quoted is nowhere in the repo's markdown. The
 * invariant is real, the citation was not.) This is the hot path: every `parse` /
 * `build` call with no — or empty — options resolves through it.
 *
 * ⚠ This header used to justify the pin by a `parse-scale.stress.ts` create→drop
 * leak guard that "is valid ONLY because these singletons are fixed". There is no
 * such guard: that file's own header says "**No heap tests**" — `parseQuery`
 * returns a fresh object and retains nothing, so the loop is GC-masked and a
 * heap threshold there would be theatre. Nothing downstream depends on this
 * identity; the reason to pin it is below, and it stands on its own.
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
    // callers must be immutable, or it is a process-global that anything holding
    // it can corrupt — the #897 class (`LEVEL_CONFIGS` exported unfrozen, where
    // the repo's own note records a hazard guarded against rather than a logged
    // incident). ⚠ NOT "every default-configured router": `OptionsNamespace` fills
    // `queryParams` with `DEFAULT_QUERY_PARAMS`, whose four fields are all
    // defined, so such a router misses the fast path and gets a FRESH object. The
    // singleton reaches a caller that passes nothing, or a bag with no format set.
    // Nothing in the engine mutates these three; the freeze makes that structural
    // instead of conventional.
    //
    // ⚑ Asserted in a file that constructs NO router, so the answer comes from
    // this module's own `Object.freeze` and from nothing downstream: since #1832
    // the options freeze stops at the level core owns, and `DEFAULT_QUERY_PARAMS`
    // — reachable as `OptionsNamespace`'s default `queryParams` — is one level
    // below it.
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
