import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import { serializeRouterState } from "@real-router/ssr-utils";

import { arbState, NUM_RUNS } from "./helpers";

import type { State } from "@real-router/core";

/**
 * Property-based invariants for `serializeRouterState` (#563).
 *
 * Strategy: generate arbitrary State objects, serialize, parse, and verify
 * structural invariants on the resulting payload. Compared to the four
 * unit tests in `tests/functional/utils/serializeRouterState.test.ts`,
 * fast-check exercises a broad space of name/params/path values incl.
 * empty objects, special characters, and nested structures.
 */
describe("serializeRouterState properties", () => {
  test.prop([arbState], { numRuns: NUM_RUNS.standard })(
    "output is valid JSON for any State",
    (state) => {
      expect(() => JSON.parse(serializeRouterState(state))).not.toThrow();
    },
  );

  test.prop([arbState], { numRuns: NUM_RUNS.standard })(
    "transition is always stripped",
    (state) => {
      const parsed = JSON.parse(serializeRouterState(state)) as Record<
        string,
        unknown
      >;

      expect("transition" in parsed).toBe(false);
    },
  );

  test.prop([arbState], { numRuns: NUM_RUNS.standard })(
    "name/params/path/context are preserved verbatim",
    (state) => {
      const parsed = JSON.parse(serializeRouterState(state)) as State;

      expect(parsed.name).toBe(state.name);
      // Normalize both sides through { ...obj }: fc.dictionary produces
      // null-prototype objects; JSON.parse always returns Object.prototype.
      // Spread re-homes the keys onto Object.prototype on the input side so
      // toStrictEqual sees identical prototypes — the JSON-equivalence
      // contract is what's being tested.
      expect(parsed.params).toStrictEqual({ ...state.params });
      expect(parsed.path).toBe(state.path);
      expect(parsed.context).toStrictEqual({ ...state.context });
    },
  );

  test.prop([arbState], { numRuns: NUM_RUNS.standard })(
    "no raw `<`, `>`, or `&` survive in the output (XSS escape)",
    (state) => {
      const json = serializeRouterState(state);

      expect(json).not.toContain("<");
      expect(json).not.toContain(">");
      expect(json).not.toContain("&");
    },
  );

  test.prop([arbState], { numRuns: NUM_RUNS.standard })(
    "determinism: same State produces same output",
    (state) => {
      expect(serializeRouterState(state)).toBe(serializeRouterState(state));
    },
  );

  test.prop([arbState], { numRuns: NUM_RUNS.standard })(
    "transition mutation does NOT change the output (transition is fully stripped)",
    (state) => {
      const baseline = serializeRouterState(state);

      const stateWithDifferentTransition: State = {
        ...state,
        transition: {
          phase: "deactivating",
          reason: "blocked",
          reload: true,
          redirected: true,
          from: "some.other.route",
          blocker: "guard.x",
          segments: {
            deactivated: ["a", "b"],
            activated: ["c", "d"],
            intersection: "common",
          },
        },
      };

      expect(serializeRouterState(stateWithDifferentTransition)).toBe(baseline);
    },
  );

  test.prop(
    [
      arbState,
      fc.string({ minLength: 0, maxLength: 30 }),
      fc.option(
        fc.dictionary(
          fc.stringMatching(/^[a-z]\w{0,8}$/),
          fc.string({ maxLength: 10 }),
          { maxKeys: 4 },
        ),
        { nil: undefined },
      ),
    ],
    { numRuns: NUM_RUNS.standard },
  )(
    "additional state.context.<namespace> values survive transport",
    (state, namespaceKey, payload) => {
      // Skip cases where the random key collides with reserved State fields
      // or where payload is undefined (we want to test value preservation).
      fc.pre(
        namespaceKey.length > 0 &&
          !["name", "params", "path", "transition"].includes(namespaceKey) &&
          payload !== undefined,
      );

      const stateWithExtraContext: State = {
        ...state,
        context: {
          ...state.context,
          [namespaceKey]: payload,
        },
      };

      const parsed = JSON.parse(
        serializeRouterState(stateWithExtraContext),
      ) as { context: Record<string, unknown> };

      // Spread normalizes prototype — see explanation above.
      expect(
        parsed.context[namespaceKey] as Record<string, unknown>,
      ).toStrictEqual({ ...payload });
    },
  );

  test.prop([arbState, fc.string({ maxLength: 20 })], {
    numRuns: NUM_RUNS.standard,
  })(
    "no raw `<`, `>`, `&` survive when XSS chars are in context VALUES (escape is content-agnostic)",
    (state, raw) => {
      // The base arbState hardcodes context to `{}`, so the existing XSS
      // property only exercises name/params/path. Inject GUARANTEED `<`, `>`,
      // `&` into a context value to cover the namespace bag too — the escape in
      // serializeState is content-agnostic (it scans the whole serialized
      // string), so it must catch context just as it catches params/path.
      const xss = `<${raw}>&</script>`;
      const withContext: State = {
        ...state,
        context: { ...state.context, payload: xss },
      };

      const json = serializeRouterState(withContext);

      expect(json).not.toContain("<");
      expect(json).not.toContain(">");
      expect(json).not.toContain("&");

      // ...and the value still round-trips intact.
      const parsed = JSON.parse(json) as { context: Record<string, unknown> };

      expect(parsed.context.payload).toBe(xss);
    },
  );

  test.prop([arbState, fc.string({ maxLength: 20 })], {
    numRuns: NUM_RUNS.standard,
  })(
    "U+2028 / U+2029 in context values stay JSON-valid and round-trip (by-design: not escaped)",
    (state, raw) => {
      // Line/paragraph separators are intentionally NOT escaped — calibrated
      // LOW: they are not an XSS vector, are valid inside a JSON string, and
      // modern (ES2019+) engines eval them. Pin that the output is parseable
      // and the value round-trips; deliberately do NOT assert escaping.
      const separator = `${raw}\u2028middle\u2029${raw}`;
      const withContext: State = {
        ...state,
        context: { ...state.context, separator },
      };

      const parsed = JSON.parse(serializeRouterState(withContext)) as {
        context: Record<string, unknown>;
      };

      expect(parsed.context.separator).toBe(separator);
    },
  );
});
