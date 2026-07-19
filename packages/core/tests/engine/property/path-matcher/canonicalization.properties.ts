import { fc, test } from "@fast-check/vitest";

import {
  arbEncoding,
  arbMatchSafeEncodableSplatValue,
  createParamMatcher,
  createSplatMatcher,
  NUM_RUNS,
} from "./helpers";

import type { URLParamsEncodingType } from "../../../../src/engine/path-matcher/types";

/**
 * Canonicalization invariant — `build∘match` is a fixpoint.
 *
 * `core`'s `rewritePathOnMatch` rebuilds `state.path` by feeding a match result
 * back through `buildPath`, then matches again. For that to be stable (no drift,
 * no loop, no crash) the matcher must canonicalize: matching a built path and
 * re-building from the recovered params must reproduce the **same** path and the
 * **same** params. The bug class behind #736 (param under wrong name) and #740
 * (empty param → parent route) were exactly `build∘match` disagreements.
 *
 * This is the property `core` relies on — asserted here independently of any
 * single example.
 */

describe("Canonicalization — build∘match is a fixpoint", () => {
  // Non-empty arbitrary value (fc.string emits no lone surrogates; "" is
  // rejected for a required param since #740). `default`/`uriComponent`
  // percent-encode everything that would break a segment, so they round-trip
  // for *any* value — including `/` (→ `%2F`). (`uri`/`none` leave `/` raw — a
  // documented limitation, #739 — so they are out of scope for arbitrary values.)
  const arbValue = fc.string({ minLength: 1, maxLength: 20 });
  const arbFullRoundtripEncoding = fc.constantFrom<URLParamsEncodingType>(
    "default",
    "uriComponent",
  );

  test.prop([arbFullRoundtripEncoding, arbValue], {
    numRuns: NUM_RUNS.thorough,
  })(
    "param route: matching a built path and re-building is a stable fixpoint",
    (encoding, value) => {
      const matcher = createParamMatcher({ urlParamsEncoding: encoding });

      const path0 = matcher.buildPath("users.profile", { id: value });
      const match1 = matcher.match(path0);

      expect(match1).toBeDefined();
      expect(match1!.segments.at(-1)!.fullName).toBe("users.profile");
      // Full roundtrip: the recovered value equals the input.
      expect(match1!.params).toStrictEqual({ id: value });

      // Re-building from the recovered params yields the identical path...
      const path1 = matcher.buildPath("users.profile", match1!.params);

      expect(path1).toBe(path0);

      // ...and matching again is a fixpoint (same name, same params).
      const match2 = matcher.match(path1);

      expect(match2!.segments.at(-1)!.fullName).toBe("users.profile");
      expect(match2!.params).toStrictEqual(match1!.params);
    },
  );

  test.prop([arbEncoding, arbMatchSafeEncodableSplatValue], {
    numRuns: NUM_RUNS.standard,
  })(
    "splat route: build∘match is a fixpoint, and non-none encodes the spaces",
    (encoding, value) => {
      // Space-bearing splat segments round-trip under every strategy (`none`
      // keeps them raw; the rest encode each segment's space to %20), so the
      // fixpoint must hold for all four; AND a non-identity strategy must encode
      // in the URL. Anti-identity gives the encoding axis real teeth (vs
      // `arbSplatValue`, an encoder fixpoint) on top of the structural fixpoint
      // and per-segment `/`-preservation.
      const matcher = createSplatMatcher({ urlParamsEncoding: encoding });

      const path0 = matcher.buildPath("files", { path: value });
      const match1 = matcher.match(path0);

      expect(match1).toBeDefined();
      expect(match1!.params).toStrictEqual({ path: value });

      const path1 = matcher.buildPath("files", match1!.params);

      expect(path1).toBe(path0);
      expect(matcher.match(path1)!.params).toStrictEqual(match1!.params);

      // anti-identity: spaces are raw under `none`, percent-encoded otherwise.
      if (encoding === "none") {
        expect(path0).toContain(" ");
      } else {
        expect(path0).not.toContain(" ");
        expect(path0).toContain("%");
      }
    },
  );
});
