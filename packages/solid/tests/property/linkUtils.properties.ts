// packages/solid/tests/property/linkUtils.properties.ts

/**
 * Property-based tests for shared dom-utils helpers as actually imported and
 * used by the Solid adapter (via the dom-utils symlink). Mirrors the React /
 * Svelte property-test set so any divergence in adapter expectations vs shared
 * helpers fails on the Solid side too.
 *
 * Confirmed bugs covered (regression-locked):
 * - `buildActiveClassName` must NOT produce double spaces when concatenating
 *   active class to a base className with surrounding/internal whitespace.
 * - Active class must be present in the result whenever isActive=true and
 *   activeClassName is non-empty.
 *
 * Coverage parity: this file is the Solid counterpart of
 * `packages/react/tests/property/linkUtils.properties.ts`.
 */

import { fc, test } from "@fast-check/vitest";
import { describe, expect, it, vi } from "vitest";

import { arbHash, arbLongString, NUM_RUNS } from "./helpers";
import {
  applyLinkA11y,
  buildActiveClassName,
  buildHref,
  shouldNavigate,
} from "../../src/dom-utils";

import type { Router } from "@real-router/core";

// Independent re-derivation of encodeFragmentInline's strict #1211 formula: the
// drift sentinel asserts buildHref matches it WITHOUT importing the production
// function (which would be a tautology). Local per adapter — the shared
// `__test-helpers` mirror was retired once the encoder became a one-liner.
const computeExpectedFragment = (rawHash: string): string =>
  encodeURI(rawHash).replaceAll("#", "%23");

// =============================================================================
// buildActiveClassName invariants
// =============================================================================

// Mixed whitespace padding — includes tab/newline/CR.
// parseTokens uses `/\S+/g`; a regression to `/[^ ]+/g` would silently
// fail on tab/newline-padded class strings.
const arbWhitespacePadding = fc.oneof(
  fc.constant(""),
  fc.constant(" "),
  fc.constant("  "),
  fc.constant("\t"),
  fc.constant("\n"),
  fc.constant("\r"),
  fc.constant(" \t"),
  fc.constant("\n  "),
);

const arbToken = fc.stringMatching(/^[a-z][a-z0-9-]{0,8}$/);

/** Base className built from N tokens with arbitrary whitespace padding. */
const arbBaseClassName: fc.Arbitrary<string> = fc
  .tuple(
    arbWhitespacePadding,
    fc.array(arbToken, { minLength: 0, maxLength: 4 }),
    arbWhitespacePadding,
  )
  .map(([head, tokens, tail]) => `${head}${tokens.join("  ")}${tail}`);

const arbActiveClassName = arbToken;

describe("buildActiveClassName — Property Tests (Solid)", () => {
  describe("Invariant 1: result never contains double spaces (when isActive)", () => {
    test.prop([arbActiveClassName, arbBaseClassName], {
      numRuns: NUM_RUNS.thorough,
    })(
      "no '  ' substring when isActive=true",
      (activeClassName, baseClassName) => {
        const result = buildActiveClassName(
          true,
          activeClassName,
          baseClassName,
        );

        // arbActiveClassName always produces a non-empty token, so the
        // active-concat path always returns a defined string.
        expect(result).toBeDefined();
        expect(result).not.toContain("  ");
      },
    );
  });

  describe("Invariant 2: active class present when isActive=true", () => {
    test.prop([arbActiveClassName, arbBaseClassName], {
      numRuns: NUM_RUNS.standard,
    })(
      "result contains activeClassName as a token",
      (activeClassName, baseClassName) => {
        const result = buildActiveClassName(
          true,
          activeClassName,
          baseClassName,
        );

        expect(result).toBeDefined();

        const tokens = result!.split(/\s+/).filter(Boolean);

        expect(tokens).toContain(activeClassName);
      },
    );
  });

  describe("Invariant 3: buildActiveClassName never ADDS a duplicate of the active token (§5.4-consistent)", () => {
    test.prop([arbActiveClassName, arbBaseClassName], {
      numRuns: NUM_RUNS.standard,
    })(
      "active token count is preserved from base (added once iff absent)",
      (activeClassName, baseClassName) => {
        const result = buildActiveClassName(
          true,
          activeClassName,
          baseClassName,
        );

        expect(result).toBeDefined();

        const tokens = result!.split(/\s+/).filter(Boolean);
        const occurrences = tokens.filter((t) => t === activeClassName).length;

        // §5.4 behaviour lock: buildActiveClassName dedupes ONLY the active
        // token it would add — it preserves pre-existing duplicates in base
        // (see the "Behaviour lock … (review §5.4)" suite below). So the active
        // token appears exactly once when it was absent from base, and exactly
        // as many times as it already did when present — NOT collapsed to 1.
        // The earlier `toBe(1)` contradicted §5.4 and flakily failed when the
        // generator produced a base repeating the active token (e.g. active
        // "c" + base " \tc  c \t" → "c c").
        const baseOccurrences = (baseClassName.match(/\S+/g) ?? []).filter(
          (t) => t === activeClassName,
        ).length;

        expect(occurrences).toBe(baseOccurrences === 0 ? 1 : baseOccurrences);
      },
    );
  });

  describe("Invariant 4: result preserves base when isActive=false", () => {
    test.prop([arbActiveClassName, arbBaseClassName], {
      numRuns: NUM_RUNS.standard,
    })("isActive=false → returns baseClassName as-is", (a, base) => {
      expect(buildActiveClassName(false, a, base)).toBe(base);
    });
  });

  describe("Invariant 5: whitespace-only active token → base preserved", () => {
    // parseTokens splits on `\S+`; whitespace-only and empty strings yield
    // zero tokens. In that branch buildActiveClassName must return
    // `baseClassName ?? undefined` — note `??`, not `?:`, so empty string
    // base is preserved verbatim and not coerced to undefined.
    test.prop(
      [
        fc.oneof(fc.constant(""), fc.constant(" "), fc.constant("  ")),
        arbBaseClassName,
      ],
      { numRuns: NUM_RUNS.standard },
    )(
      "whitespace-only activeClassName returns baseClassName verbatim",
      (whitespaceActive, baseClassName) => {
        const result = buildActiveClassName(
          true,
          whitespaceActive,
          baseClassName,
        );

        expect(result).toBe(baseClassName);
      },
    );
  });

  describe("Invariant 6a: whitespace-immunity — padded base produces the same token set as unpadded", () => {
    // §6 audit Invariant 4 proposal: `parseTokens(value.match(/\S+/g))`
    // guarantees whitespace normalization. Padding the base with tabs /
    // newlines / extra spaces must not change the resulting token set —
    // only the order-insensitive multiset of tokens matters at the API
    // boundary (DOM treats class attribute as a token set).
    test.prop([arbActiveClassName, arbBaseClassName], {
      numRuns: NUM_RUNS.thorough,
    })(
      "padded base and unpadded base produce the same sorted token list",
      (activeClassName, baseClassName) => {
        // Re-pad the already-padded base: wrap with leading/trailing
        // tabs and inject extra spaces between every original char gap.
        const padded = `\t  ${baseClassName}\n  \t`.replaceAll(/\s+/g, "  ");

        const unpaddedResult = buildActiveClassName(
          true,
          activeClassName,
          baseClassName,
        );
        const paddedResult = buildActiveClassName(
          true,
          activeClassName,
          padded,
        );

        // Both apply paths normalize via parseTokens. Compare as sorted
        // multisets so the assertion is robust to dedup ordering quirks.
        const unpaddedTokens = (unpaddedResult ?? "")
          .split(/\s+/)
          .filter(Boolean)
          .toSorted((a, b) => a.localeCompare(b));
        const paddedTokens = (paddedResult ?? "")
          .split(/\s+/)
          .filter(Boolean)
          .toSorted((a, b) => a.localeCompare(b));

        expect(paddedTokens).toStrictEqual(unpaddedTokens);
      },
    );
  });

  describe("Invariant 6: strict idempotency — apply-twice returns the same string", () => {
    // The first apply normalizes whitespace (parseTokens collapses any `\s+`
    // padding into single-space joins). The second apply over the already-
    // normalized output must reproduce the exact same string.
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

  describe("Invariant 7: long-string length stress (§2.3 audit)", () => {
    // Real consumers may load class lists from `clsx(...arbitraryArgs)` or
    // CSS-Module bag-of-classes — easily 256+ chars. The token parser
    // (parseTokens, `/\S+/g`) is linear in length; lock the behaviour
    // (no truncation, no thrash) at ≥256 chars.
    test.prop([arbActiveClassName, arbLongString], {
      numRuns: NUM_RUNS.standard,
    })(
      "active class still present exactly once after ≥256-char base",
      (activeClassName, longBase) => {
        const result = buildActiveClassName(true, activeClassName, longBase);

        expect(result).toBeDefined();

        const occurrences = result!
          .split(/\s+/)
          .filter((t) => t === activeClassName).length;

        expect(occurrences).toBe(1);
      },
    );
  });

  describe("Invariant 7a: Conservation — |outputTokens| ≤ |baseTokens| + |activeTokens| (audit-2026-05-17 §6 Stage-2)", () => {
    // No token amplification: buildActiveClassName only ever DROPS tokens
    // (active tokens already present in base), never invents them — so the
    // output count can never exceed base + active combined.
    //
    // The bound is the COMBINED token counts (multiset cardinalities), exactly
    // as this block's title states (`|out| ≤ |base| + |active|`). It is
    // deliberately NOT a set-union: per the frozen contract (review §5.4,
    // locked in the react/preact/vue linkUtils PBTs + functional suites) the
    // helper dedups active-vs-base only — duplicates *within* a single string
    // are preserved (`buildActiveClassName(true, "y", "x x")` → `"x x y"`). A
    // set-union bound would falsely assume base-internal dedup the helper never
    // promised and flake whenever the generator emits a base with repeats.
    test.prop([arbActiveClassName, arbBaseClassName], {
      numRuns: NUM_RUNS.standard,
    })(
      "result token count never exceeds the combined base + active token counts",
      (active, base) => {
        const result = buildActiveClassName(true, active, base) ?? "";
        const resultCount = result.split(/\s+/).filter(Boolean).length;
        const baseCount = base.split(/\s+/).filter(Boolean).length;
        const activeCount = active.split(/\s+/).filter(Boolean).length;

        expect(resultCount).toBeLessThanOrEqual(baseCount + activeCount);
      },
    );
  });

  describe("Invariant 7b: multi-token active className adds ALL tokens (audit-2026-05-17 §6 Stage-1)", () => {
    // The helper splits `activeClassName` via parseTokens and concatenates
    // each unique token. A regression that read only `activeClassName.split(' ')[0]`
    // or stopped after the first token would still pass Invariant 2 (single
    // token present), but would silently drop the rest. Lock the multi-token
    // contract over fc.array of 2-4 tokens against any base.
    const arbMultiActive = fc
      .array(arbToken, { minLength: 2, maxLength: 4 })
      .map((tokens) => [...new Set(tokens)] as string[])
      .filter((tokens) => tokens.length >= 2)
      .map((tokens) => tokens.join(" "));

    test.prop([arbMultiActive, arbBaseClassName], {
      numRuns: NUM_RUNS.standard,
    })(
      "all distinct active tokens appear in the result exactly once",
      (active, base) => {
        const result = buildActiveClassName(true, active, base);

        expect(result).toBeDefined();

        const activeTokens = active.split(/\s+/).filter(Boolean);
        const resultTokens = result!.split(/\s+/).filter(Boolean);

        for (const token of activeTokens) {
          expect(resultTokens.filter((t) => t === token)).toHaveLength(1);
        }
      },
    );

    test("`'a b'` active + empty base → result is 'a b' verbatim (order from active)", () => {
      expect(buildActiveClassName(true, "a b", "")).toBe("a b");
    });

    test("`'a b'` active + `'c'` base → result contains a, b, AND c", () => {
      const result = buildActiveClassName(true, "a b", "c");
      const tokens = result!
        .split(/\s+/)
        .filter(Boolean)
        .toSorted((a, b) => a.localeCompare(b));

      expect(tokens).toStrictEqual(["a", "b", "c"]);
    });
  });

  describe("Invariant 8: base=undefined edge cases (§5.6 audit)", () => {
    // arbBaseClassName always produces a string, so the `undefined` base
    // path is reachable only via raw helper invocation (e.g. `<Link>` with
    // no `class` prop). Lock the answers explicitly so a regression that
    // changes the `??` operator inside buildActiveClassName surfaces here.
    test("base=undefined + isActive=true + active='x' → just 'x'", () => {
      // No base to concatenate — result is the active token alone.
      const result = buildActiveClassName(true, "x", undefined);

      expect(result).toBe("x");
    });

    test("base=undefined + isActive=false + active='x' → undefined (preserved via ??)", () => {
      // Inactive + undefined base → nothing to return. The helper uses
      // `??` (not `||`) so this path returns `undefined`, not `""`.
      // Locked behaviour — a switch to `||` would coerce to "" silently.
      const result = buildActiveClassName(false, "x", undefined);

      expect(result).toBeUndefined();
    });

    test("base=undefined + isActive=true + active='' (empty) → undefined", () => {
      // parseTokens on "" yields zero tokens → active-concat branch is
      // skipped → fall through to `baseClassName ?? undefined`.
      const result = buildActiveClassName(true, "", undefined);

      expect(result).toBeUndefined();
    });

    test("base=undefined + isActive=true + active='a b c' (multi-token) → 'a b c' verbatim", () => {
      // No base means no dedup work — multi-token active is preserved
      // exactly as parseTokens normalizes it (single-space join).
      const result = buildActiveClassName(true, "a b c", undefined);

      expect(result).toBe("a b c");
    });
  });

  describe("Invariant 9: Order preservation — base tokens keep relative order (Sprint B.1 — audit-6 Stage-2 #2)", () => {
    // Production contract: when `isActive=true` and the result merges
    // base + active tokens, base tokens MUST keep their relative order
    // from the input. Active tokens are appended at the end (after
    // dedup against base). A refactor switching to set-based merge
    // (e.g. `[...new Set([...active, ...base])]`) would invert the
    // order and silently break CSS specificity-by-source-order in
    // consumer style sheets.
    test.prop(
      [
        arbActiveClassName,
        // Non-padded, no-duplicate base for clean order comparison.
        fc
          .array(arbToken, { minLength: 2, maxLength: 5 })
          .map((tokens) => [...new Set(tokens)] as string[])
          .filter((tokens) => tokens.length >= 2)
          .map((tokens) => tokens.join(" ")),
      ],
      { numRuns: NUM_RUNS.thorough },
    )(
      "base tokens preserve relative order in the output (active appended)",
      (active, base) => {
        const result = buildActiveClassName(true, active, base);
        const resultTokens = result!.split(/\s+/).filter(Boolean);
        const baseTokens = base.split(/\s+/).filter(Boolean);

        // Extract base tokens from result in their result-order.
        const baseInResult = resultTokens.filter((t) => baseTokens.includes(t));

        expect(baseInResult).toStrictEqual(baseTokens);
      },
    );
  });

  describe("Invariant 10: Subset relation — every base token survives in the active result (Sprint B.1)", () => {
    // Audit-2 #43 MEDIUM (Conservation of base tokens). A refactor
    // that filters base by some predicate (e.g. "drop tokens with
    // hyphens") would silently drop CSS classes from the rendered
    // element. Lock `set(base) ⊆ set(output)` when isActive=true.
    test.prop([arbActiveClassName, arbBaseClassName], {
      numRuns: NUM_RUNS.thorough,
    })(
      "every token in base also appears in result when isActive=true",
      (active, base) => {
        const result = buildActiveClassName(true, active, base) ?? "";
        const baseTokens = new Set(base.split(/\s+/).filter(Boolean));
        const resultTokens = new Set(result.split(/\s+/).filter(Boolean));

        for (const token of baseTokens) {
          expect(resultTokens.has(token)).toBe(true);
        }
      },
    );
  });
});

// =============================================================================
// buildHref invariants
// =============================================================================

function makeFakeRouter(
  buildUrl:
    | ((
        name: string,
        params: object,
        options?: { hash?: string },
      ) => string | undefined)
    | undefined,
  buildPath: (name: string, params: object) => string,
): Router {
  return { buildUrl, buildPath } as unknown as Router;
}

describe("buildHref — Property Tests (Solid)", () => {
  describe("Invariant 1: falls back to buildPath when buildUrl returns undefined", () => {
    test.prop([fc.string({ minLength: 1, maxLength: 16 })], {
      numRuns: NUM_RUNS.standard,
    })("buildUrl=()=>undefined uses buildPath result", (path) => {
      const router = makeFakeRouter(
        () => undefined,
        () => path,
      );

      expect(buildHref(router, "any", {})).toBe(path);
    });
  });

  describe("Invariant 2: falls back to buildPath when buildUrl is absent", () => {
    test.prop([fc.string({ minLength: 1, maxLength: 16 })], {
      numRuns: NUM_RUNS.standard,
    })("router without buildUrl uses buildPath", (path) => {
      const router = makeFakeRouter(undefined, () => path);

      expect(buildHref(router, "any", {})).toBe(path);
    });
  });

  describe("Invariant 3: prefers buildUrl when defined and returns string", () => {
    test.prop(
      [
        fc.string({ minLength: 1, maxLength: 16 }),
        fc.string({ minLength: 1, maxLength: 16 }),
      ],
      { numRuns: NUM_RUNS.standard },
    )("returns buildUrl result, not buildPath", (url, path) => {
      const router = makeFakeRouter(
        () => url,
        () => path,
      );

      expect(buildHref(router, "any", {})).toBe(url);
    });
  });

  describe("Invariant 4: returns undefined and logs error when both throw", () => {
    test.prop([fc.string({ minLength: 1, maxLength: 12 })], {
      numRuns: NUM_RUNS.standard,
    })("throws → undefined + console.error", (name) => {
      const router = makeFakeRouter(
        () => {
          throw new Error("no");
        },
        () => {
          throw new Error("no");
        },
      );
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      expect(buildHref(router, name, {})).toBeUndefined();
      expect(errSpy).toHaveBeenCalledWith(
        expect.stringMatching(
          /^\[real-router\] Route ".+" is not defined\. The element will render without an href attribute\.$/,
        ),
      );

      errSpy.mockRestore();
    });
  });

  describe("Invariant 5: hash encoding (RFC 3986 + defensive %23 for #)", () => {
    // buildPath fallback path: appended fragment must be encoded via encodeURI
    // with `#` defensively replaced by `%23`.
    test.prop([arbHash, fc.string({ minLength: 1, maxLength: 12 })], {
      numRuns: NUM_RUNS.thorough,
    })("fallback path → hash is encodeURI'd and # → %23", (rawHash, path) => {
      const router = makeFakeRouter(undefined, () => path);
      const href = buildHref(router, "any", {}, rawHash);

      const stripped = rawHash.startsWith("#") ? rawHash.slice(1) : rawHash;

      if (!stripped) {
        expect(href).toBe(path);

        return;
      }

      const expectedHash = computeExpectedFragment(stripped);

      expect(href).toBe(`${path}#${expectedHash}`);

      // No literal `#` in the fragment portion — verifies the defensive
      // %23 replacement actually fired.
      const fragment = href!.slice(`${path}#`.length);

      expect(fragment).not.toContain("#");
    });
  });

  describe("Invariant 6: leading `#` is stripped before encoding/passing", () => {
    // `<Link hash="#section">` and `<Link hash="section">` must produce the
    // same href — the leading `#` is a convenience, not part of the fragment.
    test.prop(
      [
        fc.string({ minLength: 1, maxLength: 12 }),
        fc.string({ minLength: 1, maxLength: 12 }),
      ],
      { numRuns: NUM_RUNS.standard },
    )("hash='#x' and hash='x' produce identical href", (rawHash, path) => {
      // rawHash must not already start with "#" so we can prepend one safely.
      fc.pre(!rawHash.startsWith("#"));

      const router = makeFakeRouter(undefined, () => path);

      const withHash = buildHref(router, "any", {}, `#${rawHash}`);
      const withoutHash = buildHref(router, "any", {}, rawHash);

      expect(withHash).toBe(withoutHash);
    });
  });

  describe("Invariant 7: empty hash falsy → no `#` suffix", () => {
    // hash === "" must not introduce a trailing `#` in the fallback path —
    // the helper returns `path` verbatim. Same for hash === "#" (only-hash).
    test.prop([fc.string({ minLength: 1, maxLength: 12 })], {
      numRuns: NUM_RUNS.standard,
    })("hash === '' returns path without `#` suffix", (path) => {
      const router = makeFakeRouter(undefined, () => path);

      expect(buildHref(router, "any", {}, "")).toBe(path);
    });

    test.prop([fc.string({ minLength: 1, maxLength: 12 })], {
      numRuns: NUM_RUNS.standard,
    })(
      "hash === '#' (strips to '') returns path without `#` suffix",
      (path) => {
        const router = makeFakeRouter(undefined, () => path);

        expect(buildHref(router, "any", {}, "#")).toBe(path);
      },
    );
  });

  describe("Invariant 8: buildUrl receives { hash } object, not { hash: undefined }", () => {
    // Plugins like browser-plugin distinguish `options === undefined` (no hash
    // intent) from `options = { hash: "" }` (explicit empty fragment). The
    // helper must NOT call buildUrl with `{ hash: undefined }`.
    test.prop([fc.string({ minLength: 1, maxLength: 12 })], {
      numRuns: NUM_RUNS.standard,
    })("no-hash call → buildUrl receives options=undefined", (name) => {
      const calls: { options: unknown }[] = [];
      const router = makeFakeRouter(
        (_n, _p, options) => {
          calls.push({ options });

          return "/url";
        },
        () => "/path",
      );

      buildHref(router, name, {});

      expect(calls).toHaveLength(1);
      expect(calls[0].options).toBeUndefined();
    });

    test.prop(
      [
        fc.string({ minLength: 1, maxLength: 12 }),
        fc.string({ minLength: 0, maxLength: 12 }),
      ],
      { numRuns: NUM_RUNS.standard },
    )(
      "with-hash call → buildUrl receives { hash: <stripped> }",
      (name, rawHash) => {
        const calls: { options: unknown }[] = [];
        const router = makeFakeRouter(
          (_n, _p, options) => {
            calls.push({ options });

            return "/url";
          },
          () => "/path",
        );

        buildHref(router, name, {}, rawHash);

        expect(calls).toHaveLength(1);

        const stripped = rawHash.startsWith("#") ? rawHash.slice(1) : rawHash;

        expect(calls[0].options).toStrictEqual({ hash: stripped });
      },
    );
  });

  describe("Invariant 9: buildHref hash idempotency — calling twice on same input returns same href", () => {
    // buildHref is a pure read over (router, name, params, hashOpts). Two
    // back-to-back invocations with identical args must produce identical
    // strings — verifies the fallback chain (buildUrl → buildPath → inline
    // encode) is deterministic with no hidden state mutation.
    test.prop(
      [
        arbHash,
        fc.string({ minLength: 1, maxLength: 12 }),
        fc.constantFrom("route", "users", "users.profile"),
      ],
      { numRuns: NUM_RUNS.thorough },
    )(
      "buildHref(...) === buildHref(...) on identical inputs",
      (rawHash, path, name) => {
        const router = makeFakeRouter(undefined, () => path);

        const first = buildHref(router, name, {}, rawHash);
        const second = buildHref(router, name, {}, rawHash);

        expect(first).toBe(second);
      },
    );

    // Stronger property — encoding stability: re-feeding the OUTPUT's
    // fragment back through buildHref as the hash input still produces an
    // encoded output where `#` → `%23` is reapplied (encoding step is
    // idempotent for the stripped/encoded portion).
    test.prop([fc.string({ minLength: 1, maxLength: 12 })], {
      numRuns: NUM_RUNS.standard,
    })(
      "buildHref output stripped → fed back yields identical fragment encoding",
      (path) => {
        const router = makeFakeRouter(undefined, () => path);

        // Use a hash with a `#` to exercise the defensive %23 replacement on
        // both rounds (the dangerous case for a non-idempotent encoder).
        const rawHash = "tab#section";
        const href1 = buildHref(router, "any", {}, rawHash);

        // Extract fragment from first call, feed it back.
        const fragment1 = href1!.slice(`${path}#`.length);
        const decoded = decodeURI(fragment1.replaceAll("%23", "#"));
        const href2 = buildHref(router, "any", {}, decoded);

        expect(href2).toBe(href1);
      },
    );
  });

  describe("Invariant 10: path with query string + hash combo (§5.3 edge-case)", () => {
    // Production routers regularly emit paths like `/users?q=1&sort=asc`.
    // The buildPath fallback concatenates `?<query>` BEFORE `#<hash>` —
    // never the other way around — so the final href shape is always
    // `<path><?query><#hash>` per WHATWG URL. Locking this prevents a
    // future refactor that swaps the concat order from producing
    // `users#tab?q=1` (which most browsers would parse as path "users",
    // fragment "tab?q=1", losing the query entirely).
    test.prop(
      [
        fc.stringMatching(/^[a-z]{1,8}$/),
        fc.stringMatching(/^[a-z]{1,8}$/),
        fc.stringMatching(/^[a-z]{1,8}$/),
      ],
      { numRuns: NUM_RUNS.standard },
    )(
      "path-with-query + hash yields `<path>?<query>#<hash>` (query before hash)",
      (pathSegment, queryValue, hash) => {
        const pathWithQuery = `/${pathSegment}?q=${queryValue}`;
        const router = makeFakeRouter(undefined, () => pathWithQuery);
        const href = buildHref(router, "any", {}, hash);

        // Hash MUST appear after the query, not inside it.
        expect(href).toBe(`${pathWithQuery}#${encodeURI(hash)}`);
        // Sanity: query string survives intact (no `#` injected before `?`).
        expect(href).toContain(`?q=${queryValue}#`);
      },
    );
  });

  describe("Invariant 11: path without leading slash (§5.3 edge-case — relative URLs)", () => {
    // Some custom plugins (memory-plugin without URL plugin, history-less
    // adapters, route-as-key approaches) emit relative paths like
    // `users/list`. WHATWG URL accepts these — buildHref must not add a
    // leading `/` or reject. Locking this preserves the relative-path
    // contract so a refactor that prepends `/` doesn't silently break
    // memory-plugin-only setups.
    test.prop(
      [
        fc.stringMatching(/^[a-z]{1,8}\/[a-z]{1,8}$/),
        fc.stringMatching(/^[a-z]{1,8}$/),
      ],
      { numRuns: NUM_RUNS.standard },
    )(
      "relative path (no leading `/`) + hash yields `<path>#<hash>` verbatim",
      (relativePath, hash) => {
        const router = makeFakeRouter(undefined, () => relativePath);
        const href = buildHref(router, "any", {}, hash);

        // Path stays relative — no leading `/` injected.
        expect(href).toBe(`${relativePath}#${encodeURI(hash)}`);
        expect(href!.startsWith("/")).toBe(false);
      },
    );

    test.prop([fc.stringMatching(/^[a-z]{1,8}\/[a-z]{1,8}$/)], {
      numRuns: NUM_RUNS.standard,
    })(
      "relative path without hash stays as-is (no trailing `#`)",
      (relativePath) => {
        const router = makeFakeRouter(undefined, () => relativePath);
        const href = buildHref(router, "any", {});

        expect(href).toBe(relativePath);
      },
    );
  });

  describe("Invariant 11b: encodeFragmentInline — multiple `#` all escape to `%23` (audit-2026-05-17 §6 Stage-2)", () => {
    // `encodeFragmentInline` (in shared/dom-utils/link-utils.ts) calls
    // `replaceAll("#", "%23")`. A refactor to `replace("#", "%23")` (single
    // replacement) would corrupt fragments with multiple `#` characters
    // into `tab%23section#trailing` — looks safe in single-# cases, fails
    // silently on multi-#. Exercise through buildHref's fallback path so
    // we don't need to export the private helper.
    test.prop([fc.integer({ min: 2, max: 6 })], { numRuns: NUM_RUNS.standard })(
      "hash with N `#` characters → result fragment contains zero `#`, exactly N `%23`",
      (count) => {
        const router = makeFakeRouter(undefined, () => "/x");
        // Build a hash like "a#a#a" (count - 1 internal `#`s) — strip the
        // leading position so the helper's leading-`#` strip doesn't eat
        // the first one.
        const hash = Array.from({ length: count }, () => "a").join("#");
        const href = buildHref(router, "any", {}, hash);
        const fragment = href!.slice("/x#".length);

        // No bare `#` survives encoding.
        expect(fragment).not.toContain("#");

        // The N-1 `#`s between "a"s all became `%23`.
        const escapeCount = (fragment.match(/%23/g) ?? []).length;

        expect(escapeCount).toBe(count - 1);
      },
    );
  });

  describe("Invariant 12: buildUrl returning null / empty string falls through to buildPath (§S1 audit)", () => {
    // The `BuildUrlFn` type contract is `string | undefined`, but the
    // implementation defends against two contract violations:
    //   - `""` (empty string) — would render `<a href="">`, which resolves
    //     to the current page URL → silent self-navigation on click.
    //   - `null` (type-cast escape) — would render as `"null"` in some
    //     stringifying renderers, or break a11y on focus.
    // Both must fall through to `router.buildPath()` instead of being
    // returned verbatim. The defensive check is
    // `typeof url === "string" && url.length > 0` (see
    // `shared/dom-utils/link-utils.ts:78`).
    test.prop([fc.string({ minLength: 1, maxLength: 12 })], {
      numRuns: NUM_RUNS.standard,
    })("buildUrl returning '' → falls through to buildPath", (path) => {
      // buildUrl returns the empty string — a contract violation that
      // would silently self-navigate if not caught.
      const router = makeFakeRouter(
        () => "",
        () => path,
      );
      const href = buildHref(router, "any", {});

      // Must NOT be "", must be the buildPath fallback.
      expect(href).toBe(path);
    });

    test.prop([fc.string({ minLength: 1, maxLength: 12 })], {
      numRuns: NUM_RUNS.standard,
    })("buildUrl returning null → falls through to buildPath", (path) => {
      // buildUrl returns null — escapes the `string | undefined`
      // type contract via a cast.
      const router = makeFakeRouter(
        () => null as unknown as string,
        () => path,
      );
      const href = buildHref(router, "any", {});

      // Must NOT be null/"null", must be the buildPath fallback.
      expect(href).toBe(path);
    });

    test.prop(
      [
        fc.string({ minLength: 1, maxLength: 12 }),
        // Hash without leading '#' or embedded '#' — keeps the expected
        // encoding simple (just encodeURI). The leading-strip + %23 defense
        // is covered by Invariants 5 and 6 separately.
        fc.stringMatching(/^[A-Za-z0-9_-]{1,8}$/),
      ],
      { numRuns: NUM_RUNS.standard },
    )(
      "buildUrl returning '' + hash → fallback applies hash via buildPath path",
      (path, hash) => {
        const router = makeFakeRouter(
          () => "",
          () => path,
        );
        const href = buildHref(router, "any", {}, hash);

        // The fallback path appends the encoded hash; the empty buildUrl
        // result is correctly skipped, so the final href reflects the
        // buildPath + hash composition (not the empty url + hash).
        expect(href).toBe(`${path}#${hash}`);
      },
    );
  });

  describe("Invariant 12b: hash is a DECODED fragment — encoded verbatim, NOT idempotent (#1211 strict contract, overturns Mini-sprint E.1)", () => {
    // #1211 (decision D1 = strictly-decoded): the `hash` value is a
    // DECODED fragment, encoded verbatim by `encodeFragmentInline` =
    // `encodeURI(s).replaceAll("#", "%23")`. There is no pre-encoded
    // "probe + round-trip" tolerance — a literal `%` in the input is a
    // literal percent sign and is escaped to `%25`. Feeding a wire
    // fragment back in therefore DOUBLE-encodes (`%20` → `%2520`); that
    // is the correct, lossless consequence of the decoded-input contract,
    // not a bug. Consumers who want the fragment `a b` pass `hash="a b"`,
    // never `hash="a%20b"`. Symmetric with browser-env's
    // `encodeHashFragment` and preact's `encodeFragmentInline` Invariant 5.
    test.prop([fc.string({ minLength: 1, maxLength: 12 })], {
      numRuns: NUM_RUNS.standard,
    })("literal `%20foo` is encoded verbatim to `%2520foo`", (path) => {
      const router = makeFakeRouter(undefined, () => `/${path}`);
      const href = buildHref(router, "any", {}, "%20foo");

      expect(href).toBeDefined();
      expect(href!).toContain("%2520foo");
    });

    test("multi-token literal fragment is encoded verbatim (every `%` → `%25`)", () => {
      const router = makeFakeRouter(undefined, () => "/x");
      const href = buildHref(router, "any", {}, "tab%20A%2Csection");

      // Decoded-input contract: `tab%20A%2Csection` is a literal string;
      // `encodeURI` escapes each literal `%` to `%25` and leaves the rest
      // (letters, digits) untouched — no decode, no round-trip.
      expect(href).toBe("/x#tab%2520A%252Csection");
    });

    test("NOT idempotent: feeding helper output back double-encodes (decoded-input contract)", () => {
      const router = makeFakeRouter(undefined, () => "/x");
      // Plain (decoded) input → first encode adds percent-escapes.
      const first = buildHref(router, "any", {}, "a b");

      expect(first).toBe("/x#a%20b");

      // Feed the WIRE fragment back in as if it were a decoded hash — the
      // literal `%` is re-escaped to `%25`, so the second pass is strictly
      // NOT equal to the first. This is the contract, not a regression.
      const fragment1 = first!.slice("/x#".length); // "a%20b"
      const second = buildHref(router, "any", {}, fragment1);

      expect(second).toBe("/x#a%2520b");
      expect(second).not.toBe(first);
    });

    test("malformed `%XX` is encoded verbatim like any other literal `%`", () => {
      // Under the strict contract there is no `decodeURIComponent` probe;
      // `encodeFragmentInline` always runs plain `encodeURI`, which never
      // throws and encodes the literal `%` to `%25`.
      const router = makeFakeRouter(undefined, () => "/x");
      const href = buildHref(router, "any", {}, "bad%ZZ");

      expect(href).toBe("/x#bad%25ZZ");
    });
  });

  describe("Invariant 13: call-count — buildPath NOT invoked when buildUrl returns a valid string (Sprint B.1 — audit-6 Stage-2 #4)", () => {
    // Locked contract: when `buildUrl` is present AND returns a valid
    // non-empty string, `buildPath` is never called. A regression that
    // always invoked both (e.g. for debug logging) would waste a route
    // resolution per Link emit AND surface edge cases where the two
    // disagree (custom plugin overrides). Pin the early-return shape.
    test.prop(
      [
        fc.string({ minLength: 1, maxLength: 12 }),
        fc.string({ minLength: 1, maxLength: 12 }),
      ],
      { numRuns: NUM_RUNS.standard },
    )(
      "buildUrl returns valid string → buildPath is never called",
      (url, fallbackPath) => {
        const buildUrlSpy = vi.fn().mockReturnValue(url);
        const buildPathSpy = vi.fn().mockReturnValue(fallbackPath);
        const router = makeFakeRouter(buildUrlSpy, buildPathSpy);

        const href = buildHref(router, "any", {});

        expect(href).toBe(url);
        expect(buildUrlSpy).toHaveBeenCalledTimes(1);
        expect(buildPathSpy).not.toHaveBeenCalled();
      },
    );

    test.prop([fc.string({ minLength: 1, maxLength: 12 })], {
      numRuns: NUM_RUNS.standard,
    })(
      "buildUrl returns '' → buildPath IS called exactly once (fallback)",
      (fallbackPath) => {
        const buildUrlSpy = vi.fn().mockReturnValue("");
        const buildPathSpy = vi.fn().mockReturnValue(fallbackPath);
        const router = makeFakeRouter(buildUrlSpy, buildPathSpy);

        const href = buildHref(router, "any", {});

        expect(href).toBe(fallbackPath);
        expect(buildUrlSpy).toHaveBeenCalledTimes(1);
        // No retry, no double-call — fallback fires ONCE.
        expect(buildPathSpy).toHaveBeenCalledTimes(1);
      },
    );
  });

  describe("Invariant 14: empty routeName behaviour (Sprint B.1 — audit-6 Stage-2 #5)", () => {
    // `<Link routeName="">` is documented as misuse (CLAUDE.md
    // gotcha #16 — sentinel always-active in unstarted state). But
    // raw `buildHref(router, "", {})` is still legitimate via custom
    // plugins. Pin the answer: it dispatches to the same buildUrl/
    // buildPath path with the literal empty string — no special
    // short-circuit, no synthesised URL.
    test("empty routeName + buildUrl returning a path → same path", () => {
      const router = makeFakeRouter(
        () => "/synthetic",
        () => "/fallback",
      );
      const href = buildHref(router, "", {});

      // No empty-name short-circuit — buildUrl is called and its
      // result is returned verbatim. A regression that early-returned
      // undefined for empty name would fail here.
      expect(href).toBe("/synthetic");
    });

    test("empty routeName + buildUrl returning empty → buildPath fallback used", () => {
      const router = makeFakeRouter(
        () => "",
        () => "/fallback",
      );
      const href = buildHref(router, "", {});

      // Same defensive fall-through as for any other routeName.
      expect(href).toBe("/fallback");
    });

    test("empty routeName + both empty → undefined + error (Sprint A.1 / P0.1 defensive)", () => {
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const router = makeFakeRouter(
        () => "",
        () => "",
      );
      const href = buildHref(router, "", {});

      // Defensive: empty path is treated as no-href (audit P0.1).
      expect(href).toBeUndefined();
      expect(consoleError).toHaveBeenCalled();

      consoleError.mockRestore();
    });
  });
});

// =============================================================================
// shouldNavigate — synthetic events without `button`
// =============================================================================

describe("shouldNavigate — Property Tests (Solid)", () => {
  describe("Invariant: synthetic Event without `button` field returns false", () => {
    // Synthetic events from custom event factories may omit the `button`
    // field entirely — e.g. `new Event("click")` rather than `MouseEvent`.
    // The helper compares `evt.button === 0`; with `undefined`, the strict
    // equality fails and the helper returns false. This is the safe default
    // (don't navigate on a click we can't classify), but the contract is
    // worth locking so a future refactor to `!evt.button` doesn't silently
    // start treating synthetic clicks as left-button navigations.
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
    )(
      "Event with no `button` field returns false regardless of modifiers",
      (modifiers) => {
        const evt = modifiers as unknown as MouseEvent;

        expect(shouldNavigate(evt)).toBe(false);
      },
    );

    it("plain Event (new Event('click')) returns false", () => {
      // Node env may not have `Event` constructor on globalThis without a DOM
      // setup, but property tests in this file run before any DOM is mounted.
      // Build the event-shape inline so the test is environment-agnostic.
      const evt = {
        metaKey: false,
        altKey: false,
        ctrlKey: false,
        shiftKey: false,
        // button intentionally omitted
      } as unknown as MouseEvent;

      expect(shouldNavigate(evt)).toBe(false);
    });
  });
});

// =============================================================================
// applyLinkA11y defensive guard
// =============================================================================

describe("applyLinkA11y — Property Tests (Solid)", () => {
  describe("Invariant 1: null / undefined element → no-op (no throw)", () => {
    // Defensive guard at the top of the helper. Most callers pass a live
    // DOM node, but null/undefined is a legitimate input when the directive
    // observes an element that has been removed from the DOM, or when a
    // consumer integrates the helper outside the directive context.
    //
    // The null/undefined branch is reached without touching any DOM API,
    // so this test can run in the node-only property-test environment
    // without jsdom. instanceof checks for HTMLAnchorElement/HTMLButtonElement
    // are NOT exercised here — they're covered by the functional tests
    // in `link-directive.test.tsx:139-167` under jsdom.
    it("applyLinkA11y(null) returns undefined without throwing", () => {
      expect(() => {
        applyLinkA11y(null);
      }).not.toThrow();
    });

    it("applyLinkA11y(undefined) returns undefined without throwing", () => {
      expect(() => {
        applyLinkA11y(undefined);
      }).not.toThrow();
    });
  });
});
