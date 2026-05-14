// packages/angular/tests/property/linkUtils.properties.ts

/**
 * Property-based tests for `shouldNavigate` and `buildActiveClassName` as
 * imported and used by Angular's directives (`RealLink`, `RealLinkActive`).
 * These exercise the production functions in
 * `packages/angular/src/dom-utils/link-utils.ts` (git-tracked copy of the
 * shared source). Drift between the copy and `shared/dom-utils/link-utils.ts`
 * surfaces here as a property-test failure.
 *
 * Closes review-2026-05-10 §6.2 invariants 5, 6, 7 + mirrors svelte parity.
 *
 * shouldNavigate invariants:
 * 1. Left click with no modifiers returns true
 * 2. Any single modifier key returns false
 * 3. Non-zero button returns false
 * 4. (Cross-modifier) cmd⇄ctrl swap is symmetric
 * 5. Any combination of ≥2 modifiers returns false
 * 6. Hostile button values (NaN, ±Infinity, negative, out-of-range) → false
 * 7. All four modifiers held simultaneously → false (pin test)
 *
 * buildActiveClassName invariants:
 * 1. isActive=false returns only baseClassName ?? undefined
 * 2. isActive=true with activeClassName includes activeClassName
 * 3. Result never contains the literal string "undefined"
 * 4. No leading/trailing spaces when one input is undefined
 * 5. Token deduplication across active and base classes
 * 6. Multi-token activeClassName preserves token order in output
 * 7. Whitespace-only activeClassName falls back to baseClassName verbatim
 * 8. Strict idempotency — apply-twice returns the exact same string
 *
 * parseTokens contract locks (exercised via buildActiveClassName):
 * - undefined/empty → zero tokens (no phantom contribution)
 * - whitespace-only (tabs, newlines, mixed) → zero tokens
 * - split-then-join roundtrip is a no-op on normalized input
 */

import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  NUM_RUNS,
  arbActiveClassName,
  arbBaseClassName,
  arbClassName,
  arbMouseEventProps,
  arbMouseEventPropsExtended,
  arbMultiTokenActiveClassName,
  arbOptionalClassName,
  arbToken,
} from "./helpers";
import { buildActiveClassName, shouldNavigate } from "../../src/dom-utils";

// =============================================================================
// shouldNavigate Tests
// =============================================================================

describe("shouldNavigate — Property Tests (Angular RealLink)", () => {
  describe("Invariant 1: Left click with no modifiers returns true", () => {
    it("button=0, no modifier keys → true", () => {
      const evt = {
        button: 0,
        metaKey: false,
        altKey: false,
        ctrlKey: false,
        shiftKey: false,
      } as unknown as MouseEvent;

      expect(shouldNavigate(evt)).toBe(true);
    });
  });

  describe("Invariant 2: Any modifier key returns false", () => {
    test.prop([fc.constantFrom("metaKey", "altKey", "ctrlKey", "shiftKey")], {
      numRuns: NUM_RUNS.standard,
    })("button=0 with any single modifier → false", (modifier) => {
      const evt = {
        button: 0,
        metaKey: false,
        altKey: false,
        ctrlKey: false,
        shiftKey: false,
        [modifier]: true,
      } as unknown as MouseEvent;

      expect(shouldNavigate(evt)).toBe(false);
    });
  });

  describe("Invariant 3: Non-zero button returns false", () => {
    test.prop([fc.integer({ min: 1, max: 5 })], { numRuns: NUM_RUNS.standard })(
      "button !== 0 → false regardless of modifiers",
      (button) => {
        const evt = {
          button,
          metaKey: false,
          altKey: false,
          ctrlKey: false,
          shiftKey: false,
        } as unknown as MouseEvent;

        expect(shouldNavigate(evt)).toBe(false);
      },
    );
  });

  describe("Invariant 4: meta and cmd modifiers behave identically", () => {
    test.prop([arbMouseEventProps], { numRuns: NUM_RUNS.standard })(
      "swapping meta⇄ctrl produces the same shouldNavigate result",
      (props) => {
        const evtA = { ...props } as unknown as MouseEvent;
        const evtB = {
          ...props,
          metaKey: props.ctrlKey,
          ctrlKey: props.metaKey,
        } as unknown as MouseEvent;

        expect(shouldNavigate(evtA)).toBe(shouldNavigate(evtB));
      },
    );
  });

  describe("Invariant 5: Any combination of ≥2 modifiers returns false", () => {
    test.prop(
      [
        fc.record({
          metaKey: fc.boolean(),
          altKey: fc.boolean(),
          ctrlKey: fc.boolean(),
          shiftKey: fc.boolean(),
        }),
      ],
      { numRuns: NUM_RUNS.standard },
    )("button=0 with 2+ modifiers held → false", (mods) => {
      const activeCount =
        Number(mods.metaKey) +
        Number(mods.altKey) +
        Number(mods.ctrlKey) +
        Number(mods.shiftKey);

      fc.pre(activeCount >= 2);

      const evt = {
        button: 0,
        ...mods,
      } as unknown as MouseEvent;

      expect(shouldNavigate(evt)).toBe(false);
    });
  });

  describe("Invariant 6: Hostile button values (NaN, negative, ±Infinity) → false", () => {
    test.prop([arbMouseEventPropsExtended], { numRuns: NUM_RUNS.standard })(
      "any non-zero or NaN button → shouldNavigate returns false",
      (props) => {
        const evt = props as unknown as MouseEvent;

        expect(shouldNavigate(evt)).toBe(false);
      },
    );
  });

  describe("Invariant 7: All four modifiers held simultaneously → false", () => {
    it("button=0 + meta + alt + ctrl + shift → shouldNavigate returns false", () => {
      const evt = {
        button: 0,
        metaKey: true,
        altKey: true,
        ctrlKey: true,
        shiftKey: true,
      } as unknown as MouseEvent;

      expect(shouldNavigate(evt)).toBe(false);
    });
  });

  // Closes review-2026-05-10 §5.1 ⛔ ("event без `button`" LOW): the strict-
  // equality check `evt.button === 0` rejects `undefined !== 0` so missing
  // button → no navigation, no NPE. Synthetic events from some testing libs
  // / custom dispatch may omit `button` entirely.
  describe("Invariant 8: missing `button` property → false (defensive)", () => {
    it("event with no button property at all → shouldNavigate returns false", () => {
      const evt = {
        metaKey: false,
        altKey: false,
        ctrlKey: false,
        shiftKey: false,
      } as unknown as MouseEvent;

      expect(shouldNavigate(evt)).toBe(false);
    });
  });
});

// =============================================================================
// buildActiveClassName Tests
// =============================================================================

describe("buildActiveClassName — Property Tests (Angular RealLink/RealLinkActive)", () => {
  describe("Invariant 1: isActive=false returns only baseClassName", () => {
    test.prop([arbOptionalClassName, arbOptionalClassName], {
      numRuns: NUM_RUNS.standard,
    })(
      "when inactive, result is baseClassName or undefined",
      (activeClassName, baseClassName) => {
        const result = buildActiveClassName(
          false,
          activeClassName,
          baseClassName,
        );

        expect(result).toBe(baseClassName ?? undefined);
      },
    );
  });

  describe("Invariant 2: isActive=true with activeClassName includes activeClassName", () => {
    test.prop([arbClassName, arbOptionalClassName], {
      numRuns: NUM_RUNS.standard,
    })(
      "when active with a non-empty activeClassName, result includes it",
      (activeClassName, baseClassName) => {
        const result = buildActiveClassName(
          true,
          activeClassName,
          baseClassName,
        );

        expect(result).toContain(activeClassName);
      },
    );
  });

  describe('Invariant 3: Result never contains the literal string "undefined"', () => {
    test.prop([fc.boolean(), arbOptionalClassName, arbOptionalClassName], {
      numRuns: NUM_RUNS.standard,
    })(
      'no "undefined" string in output for any combination',
      (isActive, activeClassName, baseClassName) => {
        const result = buildActiveClassName(
          isActive,
          activeClassName,
          baseClassName,
        );

        fc.pre(result !== undefined);

        expect(result).not.toContain("undefined");
      },
    );
  });

  describe("Invariant 4: No leading/trailing spaces when one input is undefined", () => {
    test.prop([fc.boolean(), arbOptionalClassName, arbOptionalClassName], {
      numRuns: NUM_RUNS.standard,
    })(
      "result has no leading or trailing whitespace",
      (isActive, activeClassName, baseClassName) => {
        const result = buildActiveClassName(
          isActive,
          activeClassName,
          baseClassName,
        );

        fc.pre(result !== undefined);

        expect(result).toBe(result.trim());
      },
    );
  });

  // Invariant 5 from review §6.2 — locks Set-based dedup against any regression
  // to naïve concatenation. RealLinkActive composes activeClassName with the
  // host's existing class attribute; without dedup the result would inflate
  // class strings and break consumer cascade ordering (`.btn.active` rules).
  describe("Invariant 5: Tokens are deduplicated across active and base classes", () => {
    test.prop([arbClassName, arbClassName], {
      numRuns: NUM_RUNS.standard,
    })(
      "every token appears exactly once in the merged result",
      (activeClassName, baseClassName) => {
        const result = buildActiveClassName(
          true,
          activeClassName,
          baseClassName,
        );

        fc.pre(result !== undefined);

        const tokens = result.match(/\S+/g) ?? [];
        const uniqueTokens = new Set(tokens);

        expect(tokens).toHaveLength(uniqueTokens.size);
      },
    );
  });

  // Invariant 6 from review §6.2 paired with order preservation.
  describe("Invariant 6: Multi-token activeClassName preserves declaration order", () => {
    test.prop([arbMultiTokenActiveClassName], { numRuns: NUM_RUNS.standard })(
      "when base is undefined, active tokens appear in the same order as given",
      (activeClassName) => {
        const result = buildActiveClassName(true, activeClassName, undefined);

        expect(result).toBe(activeClassName);
      },
    );

    test.prop([arbMultiTokenActiveClassName, arbToken], {
      numRuns: NUM_RUNS.standard,
    })(
      "when base has one token, active tokens appear after base, in order, dedup'd",
      (activeClassName, baseToken) => {
        const result = buildActiveClassName(true, activeClassName, baseToken);

        expect(result).toBeDefined();

        const activeTokens = activeClassName.split(/\s+/).filter(Boolean);
        const expectedTokens = [baseToken];

        for (const t of activeTokens) {
          if (!expectedTokens.includes(t)) {
            expectedTokens.push(t);
          }
        }

        expect(result).toBe(expectedTokens.join(" "));
      },
    );
  });

  // Closes review-2026-05-10 §5.1 ⛔ ("duplicate tokens в activeClassName
  // `\"a a b\"`" LOW). Pins the function's CURRENT asymmetric behavior so a
  // future refactor doesn't silently change either path:
  //
  //   - **No baseClassName** (fast path: `return activeTokens.join(" ")` at
  //     line 163 of link-utils.ts) → intra-active duplicates are PRESERVED
  //     verbatim. The function trusts the caller's input.
  //   - **With baseClassName** (Set-based merge path at line 166-176) →
  //     duplicates collapse against the seen-set seeded from `baseTokens`,
  //     so intra-active dups effectively dedup as a side effect.
  //
  // This asymmetry is intentional-by-construction (the fast path skips
  // Set allocation) but undocumented in the function. Both paths are
  // pinned here so the asymmetry stays a deliberate choice rather than
  // an accident.
  describe("Invariant 5b: Intra-active duplicates — asymmetric fast/slow paths", () => {
    it('FAST PATH: activeClassName="a a b" + no base → "a a b" (dups preserved verbatim)', () => {
      const result = buildActiveClassName(true, "a a b", undefined);

      expect(result).toBe("a a b");
    });

    it('FAST PATH: activeClassName="x y x z y" + no base → "x y x z y" (no Set, no dedup)', () => {
      const result = buildActiveClassName(true, "x y x z y", undefined);

      expect(result).toBe("x y x z y");
    });

    it('SLOW PATH: activeClassName="x y x z y" + base="base" → "base x y z" (Set-deduped, order-preserving)', () => {
      const result = buildActiveClassName(true, "x y x z y", "base");

      // baseTokens=["base"]; seen={"base"}; iterate x→add, y→add, x→skip,
      // z→add, y→skip → ["base","x","y","z"]
      expect(result).toBe("base x y z");
    });

    it('SLOW PATH: activeClassName="a b" + base="x a y" → "x a y b" (active "a" skipped, "b" added)', () => {
      const result = buildActiveClassName(true, "a b", "x a y");

      expect(result).toBe("x a y b");
    });

    it('SLOW PATH: base="a a" + active="a a a" → "a a" (baseTokens preserves dups; Set blocks all active "a")', () => {
      // parseTokens doesn't dedup → baseTokens=["a","a"], seen={"a"}.
      // All three active "a" are skipped → baseTokens stays ["a","a"].
      const result = buildActiveClassName(true, "a a a", "a a");

      expect(result).toBe("a a");
    });
  });

  describe("Invariant 7: Whitespace-only activeClassName falls back to baseClassName", () => {
    test.prop(
      [
        fc.oneof(
          fc.constant(" "),
          fc.constant("  "),
          fc.constant("\t"),
          fc.constant("\n"),
          fc.constant(" \t\n "),
        ),
        arbOptionalClassName,
      ],
      { numRuns: NUM_RUNS.standard },
    )(
      "whitespace-only active returns baseClassName ?? undefined",
      (wsActive, baseClassName) => {
        const result = buildActiveClassName(true, wsActive, baseClassName);

        expect(result).toBe(baseClassName ?? undefined);
      },
    );
  });

  describe("Invariant 7b: Empty-string base — active path returns just the active tokens", () => {
    test.prop([arbActiveClassName], { numRuns: NUM_RUNS.standard })(
      'baseClassName="" with non-empty active → returns active verbatim',
      (active) => {
        const result = buildActiveClassName(true, active, "");

        expect(result).toBe(active);
      },
    );

    test.prop([arbActiveClassName], { numRuns: NUM_RUNS.standard })(
      'baseClassName="" inactive → returns "" verbatim',
      (active) => {
        const result = buildActiveClassName(false, active, "");

        // `baseClassName ?? undefined` only short-circuits on null/undefined.
        // `""` is preserved verbatim — empty class attribute lands on the DOM.
        expect(result).toBe("");
      },
    );
  });

  describe("Invariant 8: Strict idempotency — apply-twice returns the same string", () => {
    test.prop([arbActiveClassName, arbBaseClassName], {
      numRuns: NUM_RUNS.standard,
    })(
      "buildActiveClassName(true, a, buildActiveClassName(true, a, base)) === buildActiveClassName(true, a, base)",
      (activeClassName, baseClassName) => {
        const once = buildActiveClassName(true, activeClassName, baseClassName);
        const twice = buildActiveClassName(true, activeClassName, once);

        expect(twice).toBe(once);
      },
    );
  });
});

// =============================================================================
// parseTokens — contract locks (exercised via buildActiveClassName)
//
// Invariant 7 from review §6.2 — `parseTokens` is a private helper (`/\S+/g`
// regex). Its contracts are observable through every `buildActiveClassName`
// call. A regex regression surfaces here with a meaningful failure message.
// =============================================================================

describe("parseTokens — contract locks (via buildActiveClassName)", () => {
  describe("Empty string → zero tokens (no base contribution)", () => {
    test.prop([arbToken], { numRuns: NUM_RUNS.standard })(
      'base="" → result is exactly the active class',
      (active) => {
        const result = buildActiveClassName(true, active, "");
        const tokens = result?.split(/\s+/).filter(Boolean) ?? [];

        expect(tokens).toStrictEqual([active]);
      },
    );
  });

  describe("undefined → zero tokens (early-return path)", () => {
    test.prop([arbToken], { numRuns: NUM_RUNS.standard })(
      "base=undefined → result is exactly the active class",
      (active) => {
        const result = buildActiveClassName(true, active, undefined);

        expect(result).toBe(active);
      },
    );
  });

  describe("Whitespace-only → zero tokens (tabs, newlines, mixed)", () => {
    const arbWhitespaceOnly = fc.oneof(
      fc.constant("\t"),
      fc.constant("\n"),
      fc.constant("\r"),
      fc.constant(" \t\n\r "),
      fc.constant("\t  \t"),
    );

    test.prop([arbToken, arbWhitespaceOnly], { numRuns: NUM_RUNS.standard })(
      "whitespace-only base (tab/newline) → result is exactly the active class",
      (active, wsBase) => {
        const result = buildActiveClassName(true, active, wsBase);
        const tokens = result?.split(/\s+/).filter(Boolean) ?? [];

        expect(tokens).toStrictEqual([active]);
      },
    );
  });

  describe("Roundtrip: tokens joined and re-parsed yield the same set", () => {
    test.prop([arbToken, arbBaseClassName], { numRuns: NUM_RUNS.standard })(
      "re-applying to already-normalized output is a no-op (when active not in base)",
      (active, base) => {
        const baseTokens: readonly string[] = base.match(/\S+/g) ?? [];

        fc.pre(!baseTokens.includes(active));

        const once = buildActiveClassName(true, active, base);
        const normalizedBase = once
          ?.split(/\s+/)
          .filter(Boolean)
          .filter((t) => t !== active)
          .join(" ");
        const twice = buildActiveClassName(true, active, normalizedBase ?? "");

        expect(twice).toBe(once);
      },
    );
  });

  describe("NBSP and other Unicode whitespace are token separators", () => {
    const NBSP = " ";
    const LINE_SEP = " ";
    const PARA_SEP = " ";
    const OGHAM = " ";

    it("NBSP-separated base tokens split correctly", () => {
      const baseWithNbsp = `foo${NBSP}bar${NBSP}baz`;
      const result = buildActiveClassName(true, "active", baseWithNbsp);

      expect(result).toBe("foo bar baz active");
    });

    it("NBSP-only active class falls through to whitespace-only branch", () => {
      const nbspOnly = `${NBSP}${NBSP}`;
      const result = buildActiveClassName(true, nbspOnly, "base");

      expect(result).toBe("base");
    });

    it("Other Unicode whitespace (LS, PS, OghamSpaceMark) split correctly", () => {
      const exotic = `a${LINE_SEP}b${PARA_SEP}c${OGHAM}d`;
      const result = buildActiveClassName(true, "active", exotic);

      expect(result).toBe("a b c d active");
    });
  });

  describe("Pin: buildActiveClassName(true, '', '') === ''", () => {
    it("active='', base='' → empty string verbatim (NOT undefined)", () => {
      expect(buildActiveClassName(true, "", "")).toBe("");
    });

    it("active='', base=undefined → undefined (?? fires)", () => {
      expect(buildActiveClassName(true, "", undefined)).toBeUndefined();
    });

    it("active=undefined, base='' → empty string verbatim", () => {
      expect(buildActiveClassName(true, undefined, "")).toBe("");
    });

    it("active=undefined, base=undefined → undefined", () => {
      expect(buildActiveClassName(true, undefined, undefined)).toBeUndefined();
    });
  });

  describe("Large input: 10k tokens dedup correctly (Set-based O(n+m))", () => {
    it("base with 10000 unique tokens + non-conflicting active token → 10001 tokens", () => {
      const baseTokens = Array.from({ length: 10_000 }, (_, i) => `t${i}`);
      const base = baseTokens.join(" ");
      const result = buildActiveClassName(true, "active", base);

      expect(result).toBeDefined();

      const tokens = result!.split(/\s+/).filter(Boolean);

      expect(tokens).toHaveLength(10_001);
      expect(tokens.at(-1)).toBe("active");
    });

    it("base with 10000 tokens where active is already present → dedup keeps 10000", () => {
      const baseTokens = Array.from({ length: 10_000 }, (_, i) => `t${i}`);
      const base = baseTokens.join(" ");
      const result = buildActiveClassName(true, "t5000", base);

      expect(result).toBeDefined();

      const tokens = result!.split(/\s+/).filter(Boolean);

      expect(tokens).toHaveLength(10_000);
      expect(tokens.indexOf("t5000")).toBe(5000);
    });
  });
});
