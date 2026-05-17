// packages/preact/tests/property/encodeFragmentInline.properties.ts

/**
 * Property-based tests for `encodeFragmentInline(decoded)` from
 * `shared/dom-utils/link-utils.ts:25-27` (review §6 N4).
 *
 * The helper encodes a decoded URL fragment for the `<a href>` fallback path
 * inside `buildHref` when no `buildUrl` plugin is installed. Contract per
 * the source JSDoc:
 *
 *   "RFC 3986 fragment encoding: preserve sub-delims (`&`, `=`, `?`, `:`),
 *    encode space, `%`, control chars, non-ASCII via encodeURI; defensively
 *    escape `#` (encodeURI does not)."
 *
 * Currently covered indirectly via `buildHref` Inv 4 (linkUtils.properties.ts).
 * This file locks the **modular** properties — totality on full Unicode and
 * the "`#` always → `%23`" invariant — so a regression to the helper surfaces
 * with a meaningful failure instead of a generic `buildHref` Inv 4 hit.
 *
 * **Replica disclaimer.** `encodeFragmentInline` is private (not exported
 * from `shared/dom-utils/`). This file replicates its single-line body
 * inline. Any change to `shared/dom-utils/link-utils.ts:25-27` MUST be
 * mirrored here.
 */

import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import { NUM_RUNS } from "./helpers";

// =============================================================================
// Inline replica of encodeFragmentInline (private — mirror of
// shared/dom-utils/link-utils.ts:25-27)
// =============================================================================

function encodeFragmentInline(decoded: string): string {
  return encodeURI(decoded).replaceAll("#", "%23");
}

// =============================================================================
// Tests
// =============================================================================

describe("encodeFragmentInline — Property Tests", () => {
  describe("Invariant 1: result never contains a literal `#`", () => {
    // `encodeURI` does NOT escape `#` (it is a reserved fragment delimiter
    // in the source spec); the helper's defensive `.replaceAll("#", "%23")`
    // exists precisely to guarantee this. A regression that dropped the
    // replaceAll would surface as an extra `#` inside the fragment portion
    // of the href — breaking the URL parser at the next hop.
    test.prop([fc.string()], { numRuns: NUM_RUNS.thorough })(
      "no literal `#` in output for any ASCII input",
      (input) => {
        expect(encodeFragmentInline(input)).not.toContain("#");
      },
    );

    test.prop([fc.string({ unit: "grapheme" })], {
      numRuns: NUM_RUNS.thorough,
    })("no literal `#` in output for any full-Unicode input", (input) => {
      expect(encodeFragmentInline(input)).not.toContain("#");
    });

    test.prop(
      [
        fc.constantFrom(
          "#",
          "##",
          "a#b#c",
          "#leading",
          "trailing#",
          "###",
          "#a#b#",
        ),
      ],
      { numRuns: NUM_RUNS.standard },
    )("hash-heavy inputs: every `#` becomes `%23`", (input) => {
      const result = encodeFragmentInline(input);
      const hashCount = (input.match(/#/g) ?? []).length;
      const escapedHashCount = (result.match(/%23/g) ?? []).length;

      expect(result).not.toContain("#");
      expect(escapedHashCount).toBe(hashCount);
    });
  });

  describe("Invariant 2: totality — never throws on any Unicode input", () => {
    // The helper is called from buildHref's fallback path on every Link
    // render with `hash`; a runtime throw would surface as `undefined` href
    // (caught by the buildHref try/catch) with a misleading "Route … is not
    // defined" error in the console. The property locks total semantics over
    // the full Unicode plane (BMP + supplementary, including unpaired
    // surrogates that encodeURI handles by throwing on malformed sequences).
    test.prop([fc.string()], { numRuns: NUM_RUNS.thorough })(
      "ASCII totality — never throws",
      (input) => {
        expect(() => encodeFragmentInline(input)).not.toThrow();
      },
    );

    test.prop([fc.string({ unit: "grapheme" })], {
      numRuns: NUM_RUNS.thorough,
    })(
      "full-Unicode totality — never throws on well-formed Unicode",
      (input) => {
        expect(() => encodeFragmentInline(input)).not.toThrow();
      },
    );
  });

  describe("Invariant 3: empty string round-trips to empty string", () => {
    // `encodeURI("")` returns `""`; the `replaceAll` is a no-op. The buildHref
    // fallback path uses `normHash` truthiness to skip the `#fragment` suffix
    // entirely, so this should never actually be invoked with `""` — but the
    // invariant locks the contract for defensive robustness.
    test("encodeFragmentInline('') === ''", () => {
      expect(encodeFragmentInline("")).toBe("");
    });
  });

  describe("Invariant 4: sub-delims are preserved verbatim", () => {
    // RFC 3986 fragment grammar permits `& = ? :` as sub-delims; encodeURI
    // already preserves them. Locking this contract guards against a
    // refactor that swaps in encodeURIComponent (which would percent-encode
    // these chars and break query-style fragments like `#tab=1&q=x`).
    test.prop(
      [
        fc.constantFrom(
          "tab=1",
          "tab=1&q=x",
          "k=v?x",
          "a:b",
          "section",
          "key=value&another=value",
        ),
      ],
      { numRuns: NUM_RUNS.standard },
    )("sub-delims (& = ? :) survive unchanged", (input) => {
      const result = encodeFragmentInline(input);

      expect(result).toBe(input);
    });
  });

  describe("Invariant 5: idempotency over already-encoded input is NOT a contract", () => {
    // Locking the documented gotcha (review §5.1 buildHref edge case): if a
    // consumer passes already-encoded input (e.g. `%E0%A4%A`), encodeURI
    // re-encodes `%` to `%25` → double-encoded output. The helper is NOT
    // idempotent; the contract requires DECODED input.
    test("already-encoded `%` is double-encoded (contract: input must be decoded)", () => {
      // `%` is not a reserved char in encodeURI's preserve-set; it gets
      // escaped to `%25`. Double-apply would yield `%2525`.
      const once = encodeFragmentInline("%E0%A4%A");

      expect(once).toContain("%25E0");
      expect(once).not.toBe("%E0%A4%A");
    });
  });
});
