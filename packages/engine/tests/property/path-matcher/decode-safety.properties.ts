import { fc, test } from "@fast-check/vitest";

import {
  createParamMatcher,
  createSplatMatcher,
  NUM_RUNS,
  createInputNode,
  createRootWithChildren,
} from "./helpers";
import { createTestMatcher } from "../../helpers/createTestMatcher";

/**
 * Property-based coverage for the `match()` never-throw contract (#737).
 *
 * `match()` must return `undefined` (never throw) for any invalid URL. The
 * dangerous class is percent sequences that are **syntactically** valid (`%XX`
 * with hex digits, so `validatePercentEncoding` passes) but **semantically**
 * invalid UTF-8 (`%E0%41`, `%C0%80`, `%FF`, …) — those make `decodeURIComponent`
 * throw a `URIError` deep inside `match()`.
 *
 * Two invariants:
 *
 * - **Decode mirror.** For a syntactically valid percent sequence, `match()`
 *   accepts the path iff `decodeURIComponent` succeeds on that sequence, and
 *   rejects (→ `undefined`) iff it throws. The matcher's accept/reject decision
 *   is exactly the decoder's success/failure — no path can both "match" and
 *   carry an undecodable value, and no decodable value is spuriously rejected.
 * - **Total never-throw.** For *any* input string — in the path-param slot, the
 *   splat slot, or the query string — `match()` returns without throwing.
 */

// A single percent-octet `%XX` for an arbitrary byte 0x00–0xFF (upper-hex).
const arbPercentOctet = fc
  .integer({ min: 0, max: 255 })
  .map((b) => `%${b.toString(16).padStart(2, "0").toUpperCase()}`);

// 1–8 concatenated octets — most random combinations are invalid UTF-8.
const arbPercentSeq = fc
  .array(arbPercentOctet, { minLength: 1, maxLength: 8 })
  .map((octets) => octets.join(""));

/** Oracle: does `decodeURIComponent` accept this (syntactically valid) value? */
function decodesCleanly(value: string): boolean {
  try {
    decodeURIComponent(value);

    return true;
  } catch {
    return false;
  }
}

describe("Decode-safety properties (#737)", () => {
  describe("decode mirror — match accepts iff decodeURIComponent succeeds", () => {
    const matcher = createParamMatcher();

    test.prop([arbPercentSeq], { numRuns: NUM_RUNS.thorough })(
      "param-slot accept/reject mirrors decodeURIComponent",
      (seq) => {
        let result: ReturnType<typeof matcher.match>;

        expect(() => {
          result = matcher.match(`/users/${seq}`);
        }).not.toThrow();

        if (decodesCleanly(seq)) {
          expect(result).toBeDefined();
          expect(result!.params).toStrictEqual({ id: decodeURIComponent(seq) });
        } else {
          expect(result).toBeUndefined();
        }
      },
    );

    const splatMatcher = createSplatMatcher();

    test.prop([arbPercentSeq], { numRuns: NUM_RUNS.standard })(
      "splat-slot accept/reject mirrors decodeURIComponent",
      (seq) => {
        let result: ReturnType<typeof splatMatcher.match>;

        expect(() => {
          result = splatMatcher.match(`/files/${seq}`);
        }).not.toThrow();

        if (decodesCleanly(seq)) {
          expect(result).toBeDefined();
        } else {
          expect(result).toBeUndefined();
        }
      },
    );
  });

  describe("total never-throw — match() tolerates any input string", () => {
    // Param + query route so all three decode paths are exercised.
    const matcher = createTestMatcher();
    const profile = createInputNode({
      name: "profile",
      path: "/:id?q",
      fullName: "users.profile",
    });
    const users = createInputNode({
      name: "users",
      path: "/users",
      fullName: "users",
      children: new Map([["profile", profile]]),
      nonAbsoluteChildren: [profile],
    });

    matcher.registerTree(createRootWithChildren([users]));

    test.prop([fc.string({ maxLength: 40 })], { numRuns: NUM_RUNS.thorough })(
      "never throws regardless of path-param, splat, or query content",
      (raw) => {
        expect(() => matcher.match(raw)).not.toThrow();
        expect(() => matcher.match(`/users/${raw}`)).not.toThrow();
        expect(() => matcher.match(`/users?q=${raw}`)).not.toThrow();
      },
    );

    // Query-slot decode mirror (result, not just no-throw). The param/splat
    // mirrors above pin the path `#decodeParams` try/catch; the query guard lives
    // in a SEPARATE try/catch (`#mergeQueryParams`, around the injected parser).
    // `not.toThrow` alone is blind to a guard that swallows the URIError but
    // returns `true` (match succeeds with the bad query silently dropped) instead
    // of `false` (unmatched). Asserting the RESULT — undefined iff the value is
    // undecodable — is what discriminates `catch { return false }` from
    // `catch { return true }`. Path slot still asserted never-throw on the same input.
    test.prop([arbPercentSeq], { numRuns: NUM_RUNS.standard })(
      "query-slot accept/reject mirrors decodeURIComponent (result, not just no-throw)",
      (seq) => {
        let result: ReturnType<typeof matcher.match>;

        expect(() => {
          result = matcher.match(`/users?q=${seq}`);
        }).not.toThrow();

        if (decodesCleanly(seq)) {
          expect(result).toBeDefined();
        } else {
          expect(result).toBeUndefined();
        }

        expect(() => matcher.match(`/users/${seq}`)).not.toThrow();
      },
    );
  });
});
