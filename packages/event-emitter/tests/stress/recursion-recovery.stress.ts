import { describe, it, expect } from "vitest";

import { EventEmitter, RecursionDepthError } from "../../src/EventEmitter.js";

/**
 * Re-entrancy recovery guard for the depth-tracking emit path (`maxEventDepth`).
 *
 * `maxEventDepth: 5` is the DEFAULT in `@real-router/core` (constants.ts), so the
 * depth-tracking path runs on every production emit, and legal recursion up to 5
 * happens whenever a listener triggers a navigation that emits again. The unwind
 * logic is the most intricate in the emitter: the overflow throw fires BEFORE the
 * `try` (so the throwing frame runs no `finally`), then the sentinel propagates up
 * through every outer frame's per-listener `catch` (re-thrown by the shared
 * `#handleListenerError`) and each outer `finally` decrements `#depthMap`. If any
 * frame fails to unwind, residual depth accumulates and POISONS subsequent emits:
 * a later legal emit would start at a non-zero depth and throw RecursionDepthError
 * spuriously — invisible to a small single-shot test.
 *
 * This is a CORRECTNESS-under-load guard (not a heap threshold): it hammers the
 * depth ceiling ROUNDS times, and after every overflow asserts the emitter fully
 * recovers — a legal recursion to exactly MAX_DEPTH still completes. Validated
 * mutationally: breaking the unwind `finally` (skip the decrement, or mis-set the
 * delete-at-0 condition) drops `recoveries` below ROUNDS and the gate fails.
 *
 * Functional tests cover single-shot overflow and single-shot post-error
 * recovery; only this guard proves recovery holds across REPEATED overflow.
 */

const ROUNDS = 50_000;
const MAX_DEPTH = 5;

describe("event-emitter recursion recovery under repeated overflow", () => {
  it("recovers full depth headroom after every overflow — repeated overflow does not poison depth state", () => {
    const emitter = new EventEmitter<Record<string, unknown[]>>({
      limits: { maxListeners: 0, warnListeners: 0, maxEventDepth: MAX_DEPTH },
    });

    // One permanent self-recursing listener. `target` decides how deep a given
    // emit drives the recursion; `level` counts the frames entered this run.
    let level = 0;
    let target = 0;

    emitter.on("evt", () => {
      level += 1;

      if (level < target) {
        emitter.emit("evt");
      }
    });

    let overflowsCaught = 0;
    let recoveries = 0;

    for (let k = 0; k < ROUNDS; k++) {
      // (1) Overflow: never stop re-emitting → depth hits MAX_DEPTH → the
      // emitter throws RecursionDepthError, which must propagate to the caller.
      level = 0;
      target = Number.MAX_SAFE_INTEGER;

      try {
        emitter.emit("evt");
      } catch (error) {
        if (error instanceof RecursionDepthError) {
          overflowsCaught += 1;
        } else {
          throw error;
        }
      }

      // (2) Recovery probe: a legal recursion to exactly MAX_DEPTH must complete
      // without throwing AND reach all MAX_DEPTH frames. If the prior overflow
      // left residual depth, this emit starts above 0 and either throws early or
      // stops short — either way `level !== MAX_DEPTH` and the recovery is lost.
      level = 0;
      target = MAX_DEPTH;

      try {
        emitter.emit("evt");

        if (level === MAX_DEPTH) {
          recoveries += 1;
        }
      } catch {
        // Poisoned depth → spurious RecursionDepthError on a legal emit.
        // Leave `recoveries` un-incremented; the assertion below catches it.
      }
    }

    expect(overflowsCaught).toBe(ROUNDS);
    expect(recoveries).toBe(ROUNDS);
    // The permanent listener survived ROUNDS of overflow + recovery intact.
    expect(emitter.listenerCount("evt")).toBe(1);
  });
});
