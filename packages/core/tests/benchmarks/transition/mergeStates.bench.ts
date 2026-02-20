/**
 * mergeStates benchmarks
 *
 * Tests state merging performance:
 * - Empty params (common case)
 * - toState params only
 * - fromState params only
 * - Both params (full merge)
 * - Complex nested params
 */

import { bench, boxplot, do_not_optimize, summary } from "mitata";

import { mergeStates } from "../../../src/namespaces/NavigationNamespace/transition/mergeStates";

import type { State, StateMeta, Params } from "@real-router/types";

// Helper to create a minimal valid State
function createState(
  name: string,
  params: Params = {},
  path = "/test",
  metaOverrides: Partial<StateMeta> = {},
): State {
  const baseMeta: StateMeta = {
    id: 1,
    params: {},
    options: {},
    ...metaOverrides,
  };

  return {
    name,
    params,
    path,
    meta: baseMeta,
  };
}

// Pre-create states to avoid setup overhead in benchmarks
const EMPTY_PARAMS_TO = createState("to", {}, "/to");
const EMPTY_PARAMS_FROM = createState("from", {}, "/from");

const TO_PARAMS_ONLY = createState("to", { id: "123" }, "/to/123", {
  params: { timestamp: 1_234_567_890 },
});
const FROM_EMPTY_META = createState("from", {}, "/from");

const TO_EMPTY_META = createState("to", {}, "/to");
const FROM_PARAMS_ONLY = createState("from", {}, "/from", {
  params: { source: "guard", validated: true },
});

const BOTH_PARAMS_TO = createState("to", { id: "123" }, "/to/123", {
  params: { timestamp: 1_234_567_890 },
});
const BOTH_PARAMS_FROM = createState("from", {}, "/from", {
  params: { source: "guard", validated: true },
});

const COMPLEX_TO = createState("to", { id: "123", slug: "test" }, "/to/123", {
  params: {
    nested: { deep: { value: "test" } },
    array: ["a", "b", "c"],
    timestamp: 1_234_567_890,
  } as Params,
});
const COMPLEX_FROM = createState("from", {}, "/from", {
  params: {
    source: "middleware",
    extra: { data: "value" },
  } as Params,
});

// State with custom fields (simulating middleware additions)
const CUSTOM_FIELDS_TO: State = {
  ...createState("to", { id: "1" }, "/to/1"),
  customField: "value",
  anotherField: 42,
} as State;
const CUSTOM_FIELDS_FROM = createState("from", {}, "/from");

// ============================================================================
// Basic mergeStates scenarios
// ============================================================================

boxplot(() => {
  summary(() => {
    // Most common case: both params empty
    bench("mergeStates: empty params", () => {
      do_not_optimize(mergeStates(EMPTY_PARAMS_TO, EMPTY_PARAMS_FROM));
    }).gc("inner");

    // toState has params, fromState doesn't
    bench("mergeStates: toState params only", () => {
      do_not_optimize(mergeStates(TO_PARAMS_ONLY, FROM_EMPTY_META));
    }).gc("inner");

    // fromState has params, toState doesn't
    bench("mergeStates: fromState params only", () => {
      do_not_optimize(mergeStates(TO_EMPTY_META, FROM_PARAMS_ONLY));
    }).gc("inner");

    // Both have params - requires spread merge
    bench("mergeStates: both params", () => {
      do_not_optimize(mergeStates(BOTH_PARAMS_TO, BOTH_PARAMS_FROM));
    }).gc("inner");
  });
});

// ============================================================================
// Complex scenarios
// ============================================================================

boxplot(() => {
  summary(() => {
    // Complex nested params
    bench("mergeStates: complex nested params", () => {
      do_not_optimize(mergeStates(COMPLEX_TO, COMPLEX_FROM));
    }).gc("inner");

    // State with custom fields (middleware scenario)
    bench("mergeStates: custom fields", () => {
      do_not_optimize(mergeStates(CUSTOM_FIELDS_TO, CUSTOM_FIELDS_FROM));
    }).gc("inner");
  });
});

// ============================================================================
// Throughput test (multiple sequential calls)
// ============================================================================

boxplot(() => {
  summary(() => {
    // Simulate guard chain: 3 sequential merges
    bench("mergeStates: 3x sequential (guard chain)", () => {
      const state1 = mergeStates(EMPTY_PARAMS_TO, EMPTY_PARAMS_FROM);
      const state2 = mergeStates(TO_PARAMS_ONLY, state1);
      const state3 = mergeStates(BOTH_PARAMS_TO, state2);

      do_not_optimize(state3);
    }).gc("inner");

    // Simulate full transition: 5 sequential merges
    bench("mergeStates: 5x sequential (full transition)", () => {
      const state1 = mergeStates(EMPTY_PARAMS_TO, EMPTY_PARAMS_FROM);
      const state2 = mergeStates(TO_PARAMS_ONLY, state1);
      const state3 = mergeStates(FROM_PARAMS_ONLY, state2);
      const state4 = mergeStates(BOTH_PARAMS_TO, state3);
      const state5 = mergeStates(COMPLEX_TO, state4);

      do_not_optimize(state5);
    }).gc("inner");
  });
});
