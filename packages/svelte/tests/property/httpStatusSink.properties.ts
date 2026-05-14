// packages/svelte/tests/property/httpStatusSink.properties.ts

/**
 * Property-based tests for `createHttpStatusSink`.
 *
 * `createHttpStatusSink` is a simple SSR utility that returns a mutable
 * `{ code: number | undefined }` object per call. Its invariants:
 *
 * - **Fresh instance per call**: each invocation returns a distinct object
 *   (no singleton / shared reference). Mutations to one sink must not affect
 *   others. Module-level singletons would leak status between concurrent
 *   requests — this property locks the per-request contract.
 * - **Initial `code === undefined`**: a fresh sink always starts without a
 *   status code — the server tree has not yet written one.
 * - **Mutable (not frozen)**: `<HttpStatusCode>` writes `sink.code = code`
 *   during render. `Object.freeze` on the sink would throw under ESM strict
 *   mode — the constraint is documented in createHttpStatusSink.ts.
 *
 * Closes review §2.2 gap: `createHttpStatusSink` — PBT absent (functional
 * coverage only).
 */

import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import { NUM_RUNS } from "./helpers";
import { createHttpStatusSink } from "../../src/utils/createHttpStatusSink";

describe("createHttpStatusSink — Property Tests", () => {
  describe("Invariant 1: Each call returns a fresh object (no shared reference)", () => {
    // N calls must produce N distinct object identities so that mutations to
    // one sink (e.g. `sink.code = 404`) never affect another. A regression
    // that returned a singleton would cause cross-request status leakage.
    test.prop([fc.integer({ min: 2, max: 10 })], {
      numRuns: NUM_RUNS.standard,
    })("N sinks are pairwise distinct references", (n) => {
      const sinks = Array.from({ length: n }, () => createHttpStatusSink());

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

  describe("Invariant 2: Initial code is always undefined", () => {
    test("createHttpStatusSink().code === undefined", () => {
      const sink = createHttpStatusSink();

      expect(sink.code).toBeUndefined();
    });

    test.prop([fc.integer({ min: 2, max: 10 })], {
      numRuns: NUM_RUNS.standard,
    })("N consecutive fresh sinks all start with code === undefined", (n) => {
      for (let i = 0; i < n; i++) {
        expect(createHttpStatusSink().code).toBeUndefined();
      }
    });
  });

  describe("Invariant 3: Sink is mutable (not frozen)", () => {
    // `<HttpStatusCode>` writes during render. If the sink were frozen, the
    // assignment would throw silently under ESM strict mode and the consumer
    // would always observe `code === undefined`. The constraint is named in
    // createHttpStatusSink.ts — this property locks it.
    test.prop([fc.integer({ min: 100, max: 599 })], {
      numRuns: NUM_RUNS.standard,
    })("writing sink.code = N is observable", (code) => {
      const sink = createHttpStatusSink();

      sink.code = code;

      expect(sink.code).toBe(code);
    });

    test("sink is NOT frozen — Object.isFrozen returns false", () => {
      const sink = createHttpStatusSink();

      expect(Object.isFrozen(sink)).toBe(false);
    });

    test.prop(
      [fc.integer({ min: 100, max: 599 }), fc.integer({ min: 100, max: 599 })],
      { numRuns: NUM_RUNS.standard },
    )("last-write-wins on repeated writes", (firstCode, secondCode) => {
      const sink = createHttpStatusSink();

      sink.code = firstCode;
      sink.code = secondCode;

      expect(sink.code).toBe(secondCode);
    });
  });

  // Closes review §5.12 row 7: documented JSDoc constraint
  // "Don't `Object.freeze` the sink" must be observable as a runtime failure
  // under ESM strict mode. If a consumer freezes the sink, the `<HttpStatusCode>`
  // write `sink.code = code` throws TypeError ("Cannot assign to read only
  // property 'code' of object '#<Object>'"). Locks the "do-not-freeze"
  // contract so a refactor that returns `Object.freeze(...)` from the factory
  // would surface here.
  describe("Invariant 4: Frozen sink throws on write (strict-mode TypeError)", () => {
    test("freezing a sink → subsequent write throws TypeError", () => {
      const sink = createHttpStatusSink();

      Object.freeze(sink);

      expect(Object.isFrozen(sink)).toBe(true);
      expect(() => {
        sink.code = 404;
      }).toThrow(TypeError);

      // Sanity: the read still works.
      expect(sink.code).toBeUndefined();
    });

    test.prop([fc.integer({ min: 100, max: 599 })], {
      numRuns: NUM_RUNS.standard,
    })(
      "value written BEFORE freeze is preserved, post-freeze writes throw",
      (code) => {
        const sink = createHttpStatusSink();

        sink.code = code;
        Object.freeze(sink);

        expect(sink.code).toBe(code);
        expect(() => {
          sink.code = 500;
        }).toThrow(TypeError);
        // Original value survives the failed write.
        expect(sink.code).toBe(code);
      },
    );
  });

  // Closes review §5.12 row 8: per-request isolation — the typical SSR
  // request handler creates ONE sink per request. With N concurrent requests
  // in flight, N distinct sinks must not see each other's writes. The
  // function is synchronous and stateless, so this is essentially a stronger
  // form of Inv1, but pinning it explicitly with realistic SSR-render
  // semantics surfaces a regression toward module-level state more clearly.
  describe("Invariant 5: Concurrent requests — N sinks isolate writes", () => {
    test.prop([fc.integer({ min: 3, max: 10 })], {
      numRuns: NUM_RUNS.standard,
    })(
      "N sinks each written with distinct codes — every sink retains its own value",
      (n) => {
        // Simulate N concurrent SSR requests. Each gets its own sink.
        const sinks = Array.from({ length: n }, () => createHttpStatusSink());
        const codes = Array.from({ length: n }, (_, i) => 400 + i);

        // Interleave writes to simulate concurrent handler execution.
        for (let i = 0; i < n; i++) {
          sinks[i].code = codes[i];
        }
        // Re-write some in a different order — last-write-wins per sink.
        for (let i = n - 1; i >= 0; i--) {
          sinks[i].code = codes[i];
        }

        // Each sink has its own value, no cross-contamination.
        for (let i = 0; i < n; i++) {
          expect(sinks[i].code).toBe(codes[i]);
        }
      },
    );

    test("Promise.all simulation: async writes to distinct sinks complete without cross-contamination", async () => {
      const sinks = Array.from({ length: 5 }, () => createHttpStatusSink());
      const codes = [401, 403, 404, 451, 500];

      await Promise.all(
        sinks.map(async (sink, i) => {
          // Yield to the microtask queue to simulate async render boundaries.
          await Promise.resolve();
          sink.code = codes[i];
          await Promise.resolve();
        }),
      );

      for (const [i, sink] of sinks.entries()) {
        expect(sink.code).toBe(codes[i]);
      }
    });
  });

  // Closes review §5.12 row 9: extended HTTP code coverage. The existing
  // functional test pins 410 + 451; this property test sweeps the realistic
  // SSR code surface — 1xx informational, 2xx success, 3xx redirect, 4xx
  // client error, 5xx server error.
  describe("Invariant 6: All HTTP status codes round-trip (1xx-5xx)", () => {
    test.prop(
      [
        fc.constantFrom(
          101, // Switching Protocols
          200, // OK
          201, // Created
          204, // No Content
          301, // Moved Permanently
          302, // Found
          304, // Not Modified
          400, // Bad Request
          401, // Unauthorized
          403, // Forbidden
          404, // Not Found
          410, // Gone
          451, // Unavailable for Legal Reasons
          500, // Internal Server Error
          502, // Bad Gateway
          503, // Service Unavailable
          504, // Gateway Timeout
        ),
      ],
      { numRuns: NUM_RUNS.standard },
    )("code (1xx-5xx) is stored and read back verbatim", (code) => {
      const sink = createHttpStatusSink();

      sink.code = code;

      expect(sink.code).toBe(code);
    });

    test("undefined is a valid reset value (sink.code = undefined)", () => {
      // After writing a code, a consumer can reset to undefined — useful when
      // a request handler reuses the sink between phases.
      const sink = createHttpStatusSink();

      sink.code = 500;

      expect(sink.code).toBe(500);

      sink.code = undefined;

      expect(sink.code).toBeUndefined();
    });
  });
});
