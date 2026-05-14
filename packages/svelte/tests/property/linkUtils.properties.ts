// packages/svelte/tests/property/linkUtils.properties.ts

/**
 * Property-based tests for shouldNavigate and buildActiveClassName as actually
 * imported and used by the Svelte adapter (via the dom-utils symlink). These
 * tests deliberately exercise the production functions — not local replicas —
 * so any divergence between adapter expectations and shared helpers is caught.
 *
 * shouldNavigate invariants:
 * 1. Left click with no modifiers returns true
 * 2. Any single modifier key returns false
 * 3. Non-zero button returns false
 * 4. (Cross-modifier) cmd⇄ctrl swap is symmetric — same verdict either way
 * 5. Any combination of ≥2 modifiers returns false (covers the multi-mod gap
 *    flagged by review §2.2 — single-modifier coverage missed mod-pairs like
 *    cmd+shift used for "open in new tab")
 *
 * buildActiveClassName invariants:
 * 1. isActive=false returns only baseClassName
 * 2. isActive=true with activeClassName includes activeClassName
 * 3. Result never contains the literal string "undefined"
 * 4. No leading/trailing spaces when one input is undefined
 * 5. Token deduplication across active and base classes (Set-based optimization)
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

describe("shouldNavigate — Property Tests (Svelte Link)", () => {
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

  describe("Invariant 4: meta and cmd modifiers behave identically (mac vs everywhere else)", () => {
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

  // Closes review §2.2 LOW gap: single-modifier coverage missed mod-pairs like
  // cmd+shift (browser convention for "open in new background tab") and
  // ctrl+alt+shift (some Linux DEs intercept this). The implementation uses
  // four independent `!` checks combined via `&&` — if any one regresses to
  // `||` or is silently dropped, this property test fails by yielding `true`
  // for a multi-modifier draw.
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

  // Closes review §2.4 "edge cases not covered": NaN button, negative button,
  // ±Infinity, out-of-range high integers. Real browsers never emit these,
  // but synthetic events from testing libraries (testing-library `fireEvent`,
  // manual `new MouseEvent({ button: -1 })`) can. The `button === 0` strict-
  // equality check must reject every non-zero value, including `NaN !== 0`
  // (NaN compares unequal to itself, so the check correctly returns false).
  describe("Invariant 6: Hostile button values (NaN, negative, ±Infinity) → false", () => {
    test.prop([arbMouseEventPropsExtended], { numRuns: NUM_RUNS.standard })(
      "any non-zero or NaN button → shouldNavigate returns false",
      (props) => {
        const evt = props as unknown as MouseEvent;

        expect(shouldNavigate(evt)).toBe(false);
      },
    );
  });

  // Closes review §5.1 row 5 explicitly: although Inv5 covers ≥2 modifiers
  // (which includes the all-4 case during random exploration), this single
  // pinned case asserts the exact "all four modifiers held together"
  // scenario. The implementation uses four independent `!` checks combined
  // via `&&` — none of them must be silently dropped. A regression that
  // weakens any of the four would still fail Inv5 randomly, but this test
  // surfaces with a clearer failure message ("all-4 modifiers → false").
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
});

// =============================================================================
// buildActiveClassName Tests
// =============================================================================

describe("buildActiveClassName — Property Tests (Svelte Link)", () => {
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

        // Precondition filters out the valid undefined-return case so the
        // invariant applies unconditionally to every string result.
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

  // Locks in the Set-based dedup optimization in buildActiveClassName:
  // duplicate tokens across activeClassName and baseClassName must collapse
  // to a single occurrence in the output. If the implementation regresses to
  // naive concatenation, this test fails.
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

  // Closes review §2.2 LOW gap: multi-token activeClassName ordering.
  // Single-token `arbClassName` could not catch order-shuffling regressions
  // (e.g. swapping `for…of` for `for…of Set`). The function pushes tokens
  // in iteration order onto `baseTokens` — if that ever changed, multi-token
  // active strings would re-shuffle and break consumers relying on cascade
  // order (`.btn.active` rules win against `.active.btn`).
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

  // Closes review §2.2 LOW gap: whitespace-only active should not stomp on
  // the base class (line 159-161 of link-utils.ts — branch is reachable but
  // was untested by properties). The function uses `??` (not `?:`) so empty
  // string base is preserved verbatim, not coerced to undefined.
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

  // Closes review §2.4: `arbOptionalClassName` now includes `""` in its
  // value space (1/3 distribution) — this property now actively drives the
  // `!baseClassName` branch in link-utils.ts line 162 (`baseClassName ===""`
  // falsy → returns `activeTokens.join(" ")`). Without an explicit empty-
  // string assertion, the branch was reachable but never property-checked.
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
        // `""` is preserved verbatim — empty class attribute lands on the DOM
        // element. Locks this behaviour so a future "improvement" can't
        // silently coerce empty strings to undefined.
        expect(result).toBe("");
      },
    );
  });

  // Strict idempotency: applying buildActiveClassName twice with the same
  // active class on its own output must reproduce the same string. The first
  // call normalizes whitespace (parseTokens collapses any `\s+` padding into
  // single-space joins); the second call over the already-normalized output
  // must be a no-op — same tokens, same order, same string.
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
// `parseTokens` is a private helper (`/\S+/g` regex). Its contracts are
// observable through every `buildActiveClassName` call. These tests name the
// contracts explicitly so a regex regression (`/[^ ]+/g`, missing `\S`)
// surfaces with a meaningful failure message rather than a generic Inv hit.
// Closes review §2.2 MEDIUM gaps: undefined → []; whitespace tokens.
// =============================================================================

describe("parseTokens — contract locks (via buildActiveClassName)", () => {
  describe("Empty string → zero tokens (no base contribution)", () => {
    // parseTokens("") → [] — empty string produces no tokens.
    // Via buildActiveClassName: empty base with an active class that isn't
    // already present must yield exactly that active class (no phantom base
    // tokens).
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
    // parseTokens(undefined) → [] — the falsy guard returns `[]` before the
    // regex runs. Observable via buildActiveClassName: undefined base with a
    // non-empty active class returns exactly the active class.
    test.prop([arbToken], { numRuns: NUM_RUNS.standard })(
      "base=undefined → result is exactly the active class",
      (active) => {
        const result = buildActiveClassName(true, active, undefined);

        expect(result).toBe(active);
      },
    );
  });

  describe("Whitespace-only → zero tokens (tabs, newlines, mixed)", () => {
    // parseTokens uses `/\S+/g` — `\S` excludes all Unicode whitespace, not
    // just ASCII spaces. A regression to `/[^ ]+/g` would leave `\t`/`\n` as
    // tokens, producing "active\tclass" style output.
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
    // parseTokens(parseTokens(s).join(" ")) must equal parseTokens(s) —
    // re-parsing a normalized (single-spaced) token string must be a no-op.
    // Observable through buildActiveClassName: after the first call normalizes
    // the base string, a second call with the same active class and the
    // normalized base output must produce the identical result.
    //
    // Precondition: `active` must NOT already appear in `base`. Otherwise the
    // first call dedups active against base (active stays in its original
    // base-order position), and the strip-and-reapply trick moves active to
    // the end — locking unequal strings. That's a property of the test
    // construction, not the function; we exclude that case rather than weaken
    // the equality assertion.
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

  // Closes review §5.4 row 4: Non-breaking space (U+00A0) is part of the JS
  // `\s` character class — so `\S+` does NOT match NBSP. parseTokens uses
  // `/\S+/g`, so an NBSP-separated string splits into multiple tokens. A
  // regression that swapped to `/[^ ]+/g` (ASCII space only) would FAIL to
  // split on NBSP — copy-paste from rich-text editors often contains NBSP
  // between visually-spaced words, and that would land as a single token.
  describe("NBSP and other Unicode whitespace are token separators", () => {
    const NBSP = "\u00A0";
    const LINE_SEP = "\u2028";
    const PARA_SEP = "\u2029";
    const OGHAM = "\u1680";

    it("NBSP-separated base tokens split correctly", () => {
      const baseWithNbsp = `foo${NBSP}bar${NBSP}baz`;
      const result = buildActiveClassName(true, "active", baseWithNbsp);

      expect(result).toBe("foo bar baz active");
    });

    it("NBSP-only active class falls through to whitespace-only branch", () => {
      const nbspOnly = `${NBSP}${NBSP}`;
      const result = buildActiveClassName(true, nbspOnly, "base");

      // NBSP-only active → activeTokens.length === 0 → baseClassName ?? undefined
      expect(result).toBe("base");
    });

    it("Other Unicode whitespace (LS, PS, OghamSpaceMark) split correctly", () => {
      // U+2028 LINE SEPARATOR; U+2029 PARAGRAPH SEPARATOR; U+1680 OGHAM SPACE MARK
      const exotic = `a${LINE_SEP}b${PARA_SEP}c${OGHAM}d`;
      const result = buildActiveClassName(true, "active", exotic);

      expect(result).toBe("a b c d active");
    });
  });

  // Closes review §5.4 row 7: explicit pin-test for the corner case
  // `(true, "", "")`. The function returns `""` (not `undefined`) because:
  //   1. `isActive && activeClassName` is `true && ""` → falsy → skip active branch
  //   2. `return baseClassName ?? undefined` with baseClassName="" → "" (not undefined,
  //      since `??` only triggers on null/undefined)
  // Some consumers might expect `undefined` here; lock the actual contract so
  // a future "improvement" can't silently change it.
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

  // Closes review §5.4 row 10: Set-based dedup is O(n + m). Large inputs
  // (10k tokens combined) must (a) not stack-overflow, (b) return a correct
  // dedup'd result, (c) complete in reasonable time. A regression to O(n*m)
  // naïve concat would still pass but take noticeably longer; this test
  // doesn't pin time but catches stack/heap blowups and correctness loss.
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
      // active token is "t5000", which already exists in base
      const result = buildActiveClassName(true, "t5000", base);

      expect(result).toBeDefined();

      const tokens = result!.split(/\s+/).filter(Boolean);

      // Dedup: still 10000 (active "t5000" was already in base).
      expect(tokens).toHaveLength(10_000);
      // The first occurrence of t5000 stays in its original position.
      expect(tokens.indexOf("t5000")).toBe(5000);
    });
  });
});
