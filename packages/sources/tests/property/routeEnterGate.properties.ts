import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import { createRouteEnterGate } from "../../src/createRouteEnterGate.js";

import type { State } from "@real-router/core";

// Pure over name / transition.from / reference identity — structural fakes.
const mkState = (name: string, from?: string): State =>
  ({ name, transition: { from } }) as unknown as State;

const PURE_RUNS = 1000;

const arbName = fc.string({ minLength: 1, maxLength: 8 });

describe("createRouteEnterGate — properties", () => {
  test.prop([arbName, fc.integer({ min: 1, max: 12 })], {
    numRuns: PURE_RUNS,
  })(
    "the same route reference dispatches at most once across N consecutive calls (StrictMode idempotence)",
    (name, n) => {
      const gate = createRouteEnterGate();
      // from !== name so the same-route arm never fires
      const route = mkState(name, `${name}~from`);
      const previousRoute = mkState("prev");

      let dispatches = 0;

      for (let i = 0; i < n; i++) {
        if (gate(route, previousRoute, true) !== null) {
          dispatches += 1;
        }
      }

      expect(dispatches).toBe(1);
    },
  );

  test.prop(
    [
      fc.array(
        fc.record({
          name: fc.string({ minLength: 1, maxLength: 6 }),
          from: fc.option(fc.string({ maxLength: 6 }), { nil: undefined }),
          hasPrev: fc.boolean(),
          skipSameRoute: fc.boolean(),
        }),
        { maxLength: 20 },
      ),
    ],
    { numRuns: PURE_RUNS },
  )(
    "a dispatch implies transition.from is truthy AND previousRoute is present (and, under skipSameRoute, from !== name)",
    (calls) => {
      const gate = createRouteEnterGate();

      for (const call of calls) {
        // fresh reference per call → the dedupe arm never masks the guards
        const route = mkState(call.name, call.from);
        const previousRoute = call.hasPrev ? mkState("prev") : undefined;

        const result = gate(route, previousRoute, call.skipSameRoute);

        if (result !== null) {
          expect(Boolean(route.transition.from)).toBe(true);
          expect(previousRoute).toBeDefined();

          if (call.skipSameRoute) {
            expect(route.transition.from).not.toBe(route.name);
          }
        }
      }
    },
  );
});
