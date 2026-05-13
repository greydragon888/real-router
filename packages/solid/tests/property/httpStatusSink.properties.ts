// packages/solid/tests/property/httpStatusSink.properties.ts

/**
 * Property-based tests for `createHttpStatusSink`.
 *
 * The factory must produce a fresh, mutable sink per call. Two invariants:
 *
 * - **Fresh `code === undefined`:** every call returns an object whose `code`
 *   is `undefined`. A module-level singleton would leak state across requests.
 * - **Distinct identity per call:** N calls yield N distinct object references.
 *   `<HttpStatusCode>` writes through to the sink — sharing a reference across
 *   requests would cross-pollinate response codes between concurrent renders.
 */

import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import { NUM_RUNS } from "./helpers";
import { createHttpStatusSink } from "../../src/utils/createHttpStatusSink";

describe("createHttpStatusSink — Property Tests (Solid)", () => {
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

  describe("Invariant: Object.freeze(sink) breaks the documented constraint", () => {
    // §5.9 audit edge case — `createHttpStatusSink` is documented as
    // "don't `Object.freeze` the sink. The component writes to `.code`;
    // freezing makes the assignment throw under ESM strict mode."
    //
    // This is a documented constraint, not a guarded one — the factory
    // does NOT defensively re-create the object on every write. Locking
    // the explicit failure mode here means: if a future refactor wraps
    // the return in `Object.freeze`, this test catches it BEFORE consumers
    // see "TypeError: Cannot assign to read only property 'code'".
    it("freezing a sink makes `.code = N` throw under strict mode (TypeError)", () => {
      const sink = createHttpStatusSink();

      Object.freeze(sink);

      // TS files compile to ESM strict mode; assignment to a frozen object
      // property throws TypeError.
      expect(() => {
        sink.code = 404;
      }).toThrow(TypeError);
    });

    it("a non-frozen sink accepts arbitrary `.code` mutations (control)", () => {
      // Control case to confirm the throw above is specifically caused by
      // Object.freeze, not by some other write barrier.
      const sink = createHttpStatusSink();

      expect(() => {
        sink.code = 404;
      }).not.toThrow();
      expect(sink.code).toBe(404);
    });
  });

  describe("Invariant 3: last write wins on `.code`", () => {
    // `<HttpStatusCode>` writes to `sink.code` during render; if multiple
    // instances mount, the value reflects the last component to run. The
    // sink contract is "plain mutable cell, last write wins" — locked by
    // this property so a future refactor cannot accidentally introduce
    // first-write or accumulator semantics.
    test.prop([fc.array(fc.integer({ min: 100, max: 599 }), { minLength: 1, maxLength: 8 })], {
      numRuns: NUM_RUNS.thorough,
    })(
      "after N writes, sink.code === the last value written",
      (codes) => {
        const sink = createHttpStatusSink();

        for (const code of codes) {
          sink.code = code;
        }

        expect(sink.code).toBe(codes[codes.length - 1]);
      },
    );

    test.prop([fc.integer({ min: 100, max: 599 })], {
      numRuns: NUM_RUNS.standard,
    })(
      "writing undefined after a numeric code resets to undefined",
      (code) => {
        const sink = createHttpStatusSink();

        sink.code = code;

        expect(sink.code).toBe(code);

        sink.code = undefined;

        expect(sink.code).toBeUndefined();
      },
    );
  });
});
