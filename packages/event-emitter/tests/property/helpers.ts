import { fc } from "@fast-check/vitest";

import { EventEmitter } from "../../src/EventEmitter.js";

export const NUM_RUNS = {
  standard: 100,
  lifecycle: 50,
  async: 30,
} as const;

const EVENT_NAMES = ["event1", "event2", "event3", "event4", "event5"] as const;

export type EventName = (typeof EVENT_NAMES)[number];

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- must be `type` not `interface` for Record constraint
export type TestEventMap = {
  event1: [data: number];
  event2: [data: number];
  event3: [data: number];
  event4: [data: number];
  event5: [data: number];
};

export const arbEventName = fc.constantFrom(...EVENT_NAMES);

export const arbDistinctEventPair = fc
  .tuple(arbEventName, arbEventName)
  .filter(([a, b]) => a !== b);

export const arbListenerCount = fc.integer({ min: 1, max: 10 });

export const arbData = fc.integer({ min: -1000, max: 1000 });

export const arbMaxListeners = fc.integer({ min: 1, max: 10 });

export const arbWarnThreshold = fc.integer({ min: 1, max: 5 });

export const arbNonFunction: fc.Arbitrary<unknown> = fc.oneof(
  fc.constant(null),
  fc.constant(undefined),
  fc.integer(),
  fc.string(),
  fc.boolean(),
  fc.constant({}),
  fc.constant([]),
  fc.constant(Symbol("test")),
);

export function createTestEmitter(): EventEmitter<TestEventMap> {
  // eslint-disable-next-line unicorn/prefer-event-target -- custom EventEmitter, not Node.js EventEmitter
  return new EventEmitter<TestEventMap>();
}

/**
 * Creates N unique listener functions (distinct references).
 * Critical: EventEmitter throws on duplicate fn references per event,
 * so each element of the returned array is a separate closure.
 */
export function createUniqueListeners(n: number): {
  fn: (data: number) => void;
  getCallCount: () => number;
  getLastData: () => number | undefined;
}[] {
  return Array.from({ length: n }, () => {
    let count = 0;
    let lastData: number | undefined;

    const fn = (data: number) => {
      count++;
      lastData = data;
    };

    return {
      fn,
      getCallCount: () => count,
      getLastData: () => lastData,
    };
  });
}

export function createOrderedListeners(
  n: number,
  callOrder: number[],
): ((data: number) => void)[] {
  return Array.from({ length: n }, (_, i) => {
    return (_data: number) => {
      callOrder.push(i);
    };
  });
}
