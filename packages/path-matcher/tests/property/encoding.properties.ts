import { fc, test } from "@fast-check/vitest";

import {
  arbEncoding,
  arbSafeEncodingString,
  arbSplatValue,
  arbUnicodeString,
  NUM_RUNS,
} from "./helpers";
import {
  DECODING_METHODS,
  encodeParam,
  ENCODING_METHODS,
} from "../../src/encoding";

import type { URLParamsEncodingType } from "../../src/types";

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
  });

  describe("splat roundtrip — decode(encodeParam(v, enc, true)) === v", () => {
    test.prop([arbEncoding, arbSplatValue], {
      numRuns: NUM_RUNS.thorough,
    })(
      "splat encode+decode restores original value preserving slashes",
      (enc: URLParamsEncodingType, v: string) => {
        const encoded = encodeParam(v, enc, true);
        const decoded = DECODING_METHODS[enc](encoded);

        expect(decoded).toBe(v);
      },
    );
  });

  describe("splat preserves slash count", () => {
    test.prop([arbEncoding, arbSplatValue], {
      numRuns: NUM_RUNS.thorough,
    })(
      "encodeParam(v, enc, true) has the same number of '/' as original v",
      (enc: URLParamsEncodingType, v: string) => {
        const encoded = encodeParam(v, enc, true);
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

  describe("safe strings unchanged by default encoder", () => {
    test.prop([arbSafeEncodingString], { numRuns: NUM_RUNS.thorough })(
      "strings with only unreserved chars pass through default encoder unchanged",
      (v: string) => {
        expect(ENCODING_METHODS.default(v)).toBe(v);
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
    test.prop([arbEncoding, fc.stringMatching(/^[a-zA-Z0-9_\-.~]{0,20}$/)], {
      numRuns: NUM_RUNS.thorough,
    })(
      "encodeParam(v, enc, true) === ENCODING_METHODS[enc](v) when v has no slashes",
      (enc: URLParamsEncodingType, v: string) => {
        const splatEncoded = encodeParam(v, enc, true);
        const directEncoded = ENCODING_METHODS[enc](v);

        expect(splatEncoded).toBe(directEncoded);
      },
    );
  });
});
