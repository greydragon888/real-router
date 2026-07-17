import { fc, test } from "@fast-check/vitest";

import {
  arbEncodableSplatValue,
  arbEncodableValue,
  arbEncoding,
  arbSplatValue,
  arbUnicodeString,
  NUM_RUNS,
} from "./helpers";
import {
  DECODING_METHODS,
  encodeParam,
  ENCODING_METHODS,
} from "../../../src/path-matcher/encoding";

import type { URLParamsEncodingType } from "../../../src/path-matcher/types";

describe("Encoding Properties", () => {
  describe("encode-decode roundtrip for all 4 encodings", () => {
    test.prop([arbEncoding, arbUnicodeString], {
      numRuns: NUM_RUNS.thorough,
    })(
      "decode(encode(v, enc), enc) === v for any string and any encoding",
      (enc: URLParamsEncodingType, v: string) => {
        const encoded = ENCODING_METHODS[enc](v);
        const decoded = DECODING_METHODS[enc](encoded);

        expect(decoded).toBe(v);
      },
    );

    // Roundtrip alone is blind to an under-encoding stub: a permissive decode
    // inverts whatever encode left raw, so `decode(encode(v))===v` survives
    // `encode = identity`. Anti-identity closes that: a value with an
    // encode-requiring char (space / multibyte) must NOT pass through a
    // non-identity strategy unchanged — and must still round-trip.
    test.prop([arbEncoding, arbEncodableValue], {
      numRuns: NUM_RUNS.thorough,
    })(
      "a non-identity strategy actually transforms an encode-requiring value",
      (enc: URLParamsEncodingType, v: string) => {
        const encoded = ENCODING_METHODS[enc](v);

        if (enc === "none") {
          expect(encoded).toBe(v);
        } else {
          expect(encoded).not.toBe(v);
          expect(DECODING_METHODS[enc](encoded)).toBe(v);
        }
      },
    );
  });

  describe("splat roundtrip — decode(encodeParam(v, enc)) === v", () => {
    test.prop([arbEncoding, arbEncodableSplatValue], {
      numRuns: NUM_RUNS.thorough,
    })(
      "splat encode+decode restores the value and actually encodes each segment",
      (enc: URLParamsEncodingType, v: string) => {
        const encoded = encodeParam(v, enc);

        // roundtrip (catches a wrong/over-decode)
        expect(DECODING_METHODS[enc](encoded)).toBe(v);

        // anti-identity (catches a per-segment encode that does nothing)
        if (enc !== "none") {
          expect(encoded).not.toBe(v);
        }
      },
    );
  });

  describe("splat preserves slash count", () => {
    test.prop([arbEncoding, arbSplatValue], {
      numRuns: NUM_RUNS.thorough,
    })(
      "encodeParam(v, enc) has the same number of '/' as original v",
      (enc: URLParamsEncodingType, v: string) => {
        const encoded = encodeParam(v, enc);
        const originalCount = (v.match(/\//g) ?? []).length;
        const encodedCount = (encoded.match(/\//g) ?? []).length;

        expect(encodedCount).toBe(originalCount);
      },
    );
  });

  describe("none encoding is identity", () => {
    test.prop([fc.string()], { numRuns: NUM_RUNS.thorough })(
      "ENCODING_METHODS.none(v) === v and DECODING_METHODS.none(v) === v",
      (v: string) => {
        expect(ENCODING_METHODS.none(v)).toBe(v);
        expect(DECODING_METHODS.none(v)).toBe(v);
      },
    );
  });

  // Invariant Encoding #5 — the DISTINCTIVE contract of `default` vs `uriComponent`:
  // sub-delimiter preservation. `default` intentionally leaves `$ + , : ; |` raw,
  // whereas `uriComponent` (plain encodeURIComponent) percent-encodes them. This is
  // the only part of "safe strings unchanged" with discriminating teeth: the
  // truly-unreserved chars (`[A-Za-z0-9-._~]`) pass through encodeURIComponent
  // ITSELF, so a fast-path mutation can't change them (asserting that is a
  // tautology). Here, dropping any of `$+,:;|` from the default skip-set makes the
  // first assert fail; the second assert (uriComponent DOES encode them) keeps the
  // first non-vacuous. The roundtrip/anti-identity tests above are blind to this:
  // a decode inverts an over-encoded sub-delim, so the roundtrip still holds.
  const arbDefaultPreservedSubDelim = fc
    .stringMatching(/^[a-zA-Z0-9$+,:;|]{1,15}$/)
    .filter((s) => /[$+,:;|]/.test(s));

  describe("default preserves sub-delimiters that uriComponent encodes", () => {
    test.prop([arbDefaultPreservedSubDelim], { numRuns: NUM_RUNS.thorough })(
      "default leaves $ + , : ; | raw while uriComponent percent-encodes them",
      (v: string) => {
        // default is a no-op on its preserved set …
        expect(ENCODING_METHODS.default(v)).toBe(v);
        // … and that is non-trivial: uriComponent DOES encode these (anti-tautology).
        expect(ENCODING_METHODS.uriComponent(v)).not.toBe(v);
      },
    );
  });

  describe("encoder determinism", () => {
    test.prop([arbEncoding, arbUnicodeString], {
      numRuns: NUM_RUNS.standard,
    })(
      "same input always produces same encoded output",
      (enc: URLParamsEncodingType, v: string) => {
        const first = ENCODING_METHODS[enc](v);
        const second = ENCODING_METHODS[enc](v);

        expect(first).toBe(second);
      },
    );
  });

  describe("splat single-segment equals non-splat encode", () => {
    // Encode-requiring value (no "/") so the cross-check has teeth: a stub that
    // skips encoding the first splat segment diverges from the direct encoder.
    test.prop([arbEncoding, arbEncodableValue], {
      numRuns: NUM_RUNS.thorough,
    })(
      "encodeParam(v, enc) === ENCODING_METHODS[enc](v) when v has no slashes",
      (enc: URLParamsEncodingType, v: string) => {
        const splatEncoded = encodeParam(v, enc);
        const directEncoded = ENCODING_METHODS[enc](v);

        expect(splatEncoded).toBe(directEncoded);
      },
    );
  });
});
