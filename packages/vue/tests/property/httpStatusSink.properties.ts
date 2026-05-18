// packages/vue/tests/property/httpStatusSink.properties.ts

/**
 * Property-based tests for `createHttpStatusSink`.
 *
 * `createHttpStatusSink` is a simple SSR utility that returns a mutable
 * `{ code: number | undefined }` object per call. Its two invariants are:
 *
 * - **Fresh instance per call**: each invocation returns a distinct object
 *   (no singleton / shared reference). Mutations to one sink must not affect
 *   others.
 * - **Initial `code === undefined`**: a fresh sink always starts without a
 *   status code — the server tree has not yet written one.
 *
 * Closes §2.2 review item: `createHttpStatusSink` — PBT absent (functional only).
 */

import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import { NUM_RUNS } from "./helpers";
import { createHttpStatusSink } from "../../src/utils/createHttpStatusSink";

describe("createHttpStatusSink — Property Tests", () => {
  describe("Invariant 1: each call returns a fresh object (no shared reference)", () => {
    // N calls must produce N distinct object identities so that mutations to
    // one sink (e.g. `sink.code = 404`) never affect another. A regression
    // that returned a singleton would cause cross-request status leakage.
    test.prop([fc.integer({ min: 1, max: 10 })], {
      numRuns: NUM_RUNS.standard,
    })("N sinks are pairwise distinct references", (n) => {
      const sinks = Array.from({ length: n }, () => createHttpStatusSink());

      // All sinks are distinct objects.
      for (let i = 0; i < sinks.length; i++) {
        for (let j = i + 1; j < sinks.length; j++) {
          expect(sinks[i]).not.toBe(sinks[j]);
        }
      }
    });

    test.prop(
      [fc.integer({ min: 200, max: 599 }), fc.integer({ min: 2, max: 8 })],
      { numRuns: NUM_RUNS.standard },
    )("writing code to one sink does not affect any other sink", (code, n) => {
      const sinks = Array.from({ length: n }, () => createHttpStatusSink());

      // Write to the first sink only.
      sinks[0].code = code;

      // Every other sink must still have code === undefined.
      for (const sink of sinks.slice(1)) {
        expect(sink.code).toBeUndefined();
      }
    });
  });

  describe("Invariant 2: initial code is always undefined", () => {
    // A fresh sink starts without a status code. This is the server's signal
    // that no `<HttpStatusCode>` has written yet — the consumer defaults to 200.
    test.prop([fc.constant(null)], { numRuns: NUM_RUNS.standard })(
      "createHttpStatusSink().code === undefined",
      () => {
        const sink = createHttpStatusSink();

        expect(sink.code).toBeUndefined();
      },
    );

    test.prop([fc.integer({ min: 2, max: 10 })], {
      numRuns: NUM_RUNS.standard,
    })("N consecutive fresh sinks all start with code === undefined", (n) => {
      for (let i = 0; i < n; i++) {
        expect(createHttpStatusSink().code).toBeUndefined();
      }
    });
  });
});
