import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import { NUM_RUNS } from "./helpers";
import {
  decodeHashFragment,
  encodeHashFragment,
  normalizeHashInput,
} from "../../src/browser-env";

/**
 * Hash encoding/decoding properties — closes the PBT gap identified in the
 * 2026-05-18 audit (§2.2 G7–G10).
 *
 * The plugin pipes user-provided fragments through three helpers:
 *   - `encodeHashFragment` (decoded → URL form, used in onTransitionSuccess
 *     when serializing state.context.url.hash into the address bar);
 *   - `decodeHashFragment` (URL form → decoded, used in navigate-handler when
 *     reading `event.destination.url`'s fragment);
 *   - `normalizeHashInput` (user-typed value → canonical decoded form, used
 *     by router.navigate({ hash }), router.buildUrl({ hash }), and
 *     replaceHistoryState({ hash })).
 *
 * The audit found these were exercised only by example-based tests. Each
 * property below pins one algebraic invariant that the runtime relies on.
 */

describe("encodeHashFragment Properties", () => {
  test.prop([fc.string()], { numRuns: 2000 })(
    "G7: never throws on any string input",
    (anyStr) => {
      expect(() => encodeHashFragment(anyStr)).not.toThrow();
    },
  );

  test.prop([fc.string()], { numRuns: NUM_RUNS.standard })(
    "G7: always returns a string",
    (anyStr) => {
      expect(typeof encodeHashFragment(anyStr)).toBe("string");
    },
  );

  // NOTE: `encodeHashFragment` is NOT idempotent in the strict sense — a
  // second pass re-encodes the `%` characters from the first pass
  // (e.g. encode(" ") === "%20", encode("%20") === "%2520"). The plugin
  // never calls encode twice on the same value: encode is the last step
  // before splicing into a URL, never composed with itself. We pin the
  // weaker contract instead — fixpoint under the decode-encode pair (G8).
  // See `G8: encode∘decode∘encode === encode` for the practical roundtrip.

  test.prop([fc.string()], { numRuns: NUM_RUNS.standard })(
    "G7: output never contains a bare '#' (would terminate the fragment in the URL)",
    (anyStr) => {
      const encoded = encodeHashFragment(anyStr);

      expect(encoded).not.toMatch(/#(?!\d|[A-Fa-f])/u);
      // Stricter: no literal '#' anywhere — the implementation replaces every
      // '#' with '%23'. A single bare '#' in the output would split the URL.
      expect(encoded).not.toContain("#");
    },
  );

  test.prop(
    [
      fc.stringMatching(
        // RFC 3986 sub-delims that encodeURI already leaves alone:
        //   ! * ' ( ) ; : @ & = + $ , /
        //   plus unreserved alphanumerics and -._~
        // The plugin relies on these surviving the encoder so query-style
        // fragments (`tab=open&panel=2`) round-trip without `&` → `%26`.
        /^[a-zA-Z0-9\-._~!*'();:@&=+$,/]{1,20}$/,
      ),
    ],
    { numRuns: NUM_RUNS.standard },
  )("G7: preserves RFC-3986 sub-delims (no over-encoding)", (subDelimStr) => {
    expect(encodeHashFragment(subDelimStr)).toBe(subDelimStr);
  });
});

describe("decodeHashFragment Properties", () => {
  test.prop([fc.string()], { numRuns: 2000 })(
    "G8: never throws on any string input (try/catch fallback)",
    (anyStr) => {
      expect(() => decodeHashFragment(anyStr)).not.toThrow();
    },
  );

  test.prop([fc.string()], { numRuns: NUM_RUNS.standard })(
    "G8: always returns a string",
    (anyStr) => {
      expect(typeof decodeHashFragment(anyStr)).toBe("string");
    },
  );

  // The canonical roundtrip: encode then decode yields the original input.
  // `fc.string()` with default unit produces strings that may contain lone
  // surrogates; those throw inside `encodeURI` and `decodeHashFragment` then
  // returns the percent-encoded form unchanged — breaking equality. We skip
  // those cases via `fc.pre` so the property reflects the documented
  // contract: roundtrip holds for any string `encodeURI` accepts.
  test.prop([fc.string({ maxLength: 40 })], { numRuns: NUM_RUNS.standard })(
    "G8: decode(encode(x)) === x for any encodeURI-accepted string",
    (anyStr) => {
      try {
        encodeURI(anyStr);
      } catch {
        return; // Skip lone-surrogate inputs.
      }

      const encoded = encodeHashFragment(anyStr);
      const decoded = decodeHashFragment(encoded);

      expect(decoded).toBe(anyStr);
    },
  );

  test.prop([fc.string()], { numRuns: NUM_RUNS.standard })(
    "G8: encode∘decode∘encode === encode (fixpoint with intermediate decode)",
    (anyStr) => {
      const encoded1 = encodeHashFragment(anyStr);
      const decoded = decodeHashFragment(encoded1);
      const encoded2 = encodeHashFragment(decoded);

      expect(encoded2).toBe(encoded1);
    },
  );

  // Malformed percent-sequence: decodeURIComponent throws — the catch in
  // decodeHashFragment returns the input verbatim. Random byte sequences hit
  // this branch often enough to keep it lit in coverage.
  test.prop([fc.constantFrom("%FF", "%E0%A4", "%C0%80", "%G1"), fc.string()], {
    numRuns: NUM_RUNS.fast,
  })(
    "G8: malformed percent-sequences are returned as-is (no throw)",
    (malformed: string, suffix: string) => {
      const input = `${malformed}${suffix}`;

      // The function must not throw and must return a string. We don't assert
      // exact equality against the input because some downstream sequences
      // in `suffix` might be valid percent-encodings; the contract is just
      // "no throw, string out".
      expect(() => decodeHashFragment(input)).not.toThrow();
      expect(typeof decodeHashFragment(input)).toBe("string");
    },
  );
});

describe("normalizeHashInput Properties", () => {
  test.prop([fc.string()], { numRuns: 2000 })(
    "G9: never throws on any string input",
    (anyStr) => {
      expect(() => normalizeHashInput(anyStr)).not.toThrow();
    },
  );

  test.prop([fc.string()], { numRuns: NUM_RUNS.standard })(
    "G9: always returns a string",
    (anyStr) => {
      expect(typeof normalizeHashInput(anyStr)).toBe("string");
    },
  );

  test.prop([fc.string()], { numRuns: NUM_RUNS.standard })(
    "G9: idempotent — normalize(normalize(x)) === normalize(x)",
    (anyStr) => {
      const once = normalizeHashInput(anyStr);
      const twice = normalizeHashInput(once);

      expect(twice).toBe(once);
    },
  );

  test.prop([fc.string().filter((s) => !s.startsWith("#"))], {
    numRuns: NUM_RUNS.standard,
  })(
    "G10: normalize('#' + x) === normalize(x) for any x not starting with '#'",
    (suffix) => {
      const withHash = normalizeHashInput(`#${suffix}`);
      const without = normalizeHashInput(suffix);

      expect(withHash).toBe(without);
    },
  );

  test.prop([fc.string().filter((s) => s.startsWith("##"))], {
    numRuns: NUM_RUNS.fast,
  })(
    "G10: ALL leading '#' chars are stripped — the result never starts with '#'",
    (multiHash) => {
      // Updated from earlier behaviour where only the FIRST "#" was stripped
      // (which broke idempotence — G9 caught it on counterexample "##").
      // `normalizeHashInput` now strips every leading "#" so the result never
      // starts with one. Subsequent characters (including a literal "#" not
      // at the start) are passed through `decodeHashFragment` unchanged.
      const result = normalizeHashInput(multiHash);

      expect(result.startsWith("#")).toBe(false);
    },
  );

  test.prop([fc.constant("#")], { numRuns: 1 })(
    "G10: normalize('#') === '' (the single-hash special case)",
    (input) => {
      expect(normalizeHashInput(input)).toBe("");
    },
  );
});
