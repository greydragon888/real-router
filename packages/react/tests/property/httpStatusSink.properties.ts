// packages/react/tests/property/httpStatusSink.properties.ts

/**
 * Property-based tests for `createHttpStatusSink`.
 *
 * The factory must produce a fresh, mutable sink per call. Two invariants:
 *
 * - **Fresh `code === undefined`:** every call returns an object whose `code`
 *   is `undefined`. A module-level singleton would leak state across requests.
 * - **Distinct identity per call:** N calls yield N distinct object references.
 *   The `<HttpStatusCode>` component writes through to the sink — sharing a
 *   reference across requests would cross-pollinate response codes between
 *   concurrent renders.
 */

import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import { NUM_RUNS } from "./helpers";
import { createHttpStatusSink } from "../../src/utils/createHttpStatusSink";

describe("createHttpStatusSink — Property Tests", () => {
  describe("Invariant 1: fresh sink — code === undefined", () => {
    test.prop([fc.nat({ max: 32 })], { numRuns: NUM_RUNS.standard })(
      "after N back-to-back calls, every sink starts with code: undefined",
      (n) => {
        for (let i = 0; i < n; i++) {
          expect(createHttpStatusSink()).toStrictEqual({ code: undefined });
        }
      },
    );

    test.prop([fc.integer({ min: 100, max: 599 })], {
      numRuns: NUM_RUNS.standard,
    })("writing to a sink does not affect subsequent fresh sinks", (code) => {
      const first = createHttpStatusSink();

      first.code = code;

      const second = createHttpStatusSink();

      expect(second.code).toBeUndefined();
    });
  });

  describe("Invariant 2: distinct identity per call", () => {
    test.prop([fc.integer({ min: 1, max: 16 })], {
      numRuns: NUM_RUNS.standard,
    })("N calls produce N distinct object references", (n) => {
      const sinks = Array.from({ length: n }, createHttpStatusSink);

      expect(new Set(sinks).size).toBe(n);
    });
  });
});
