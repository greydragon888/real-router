/**
 * `defer()` reads the caller's bag once, and ships what it validated (#1914).
 *
 * ⚑ Two independent `[[Get]]` chains existed: the validation loop walked
 * `options.deferred`, and the payload was built by spreading it again. For an
 * accessor-backed bag those are different values, so the checked one and the
 * shipped one need not agree.
 *
 * ⚠ The `unhandledRejection` symptom the issue reports is not pinned separately.
 * It follows structurally from the read count: one read per key means one
 * promise, and the defensive `.catch()` is attached to the promise that ships.
 * A second cell would pin the same fact through a process-level handler and a
 * timer.
 *
 * The counting bags are local rather than imported from
 * `packages/core/tests/helpers/hostileBags.ts`: no package outside core reaches
 * into core's test helpers today, and these are ten lines.
 */

import { describe, expect, it } from "vitest";

import { defer } from "../../src";

/** A bag whose single key counts its reads and answers the same promise. */
function countingBag(promise: Promise<unknown>): {
  readonly bag: Record<string, Promise<unknown>>;
  reads: () => number;
} {
  let reads = 0;
  const bag = {
    get only() {
      reads += 1;

      return promise;
    },
  };

  return { bag: bag, reads: () => reads };
}

describe("defer() reads the caller's deferred bag once (#1914)", () => {
  it("reads a declared key exactly once", () => {
    const { bag, reads } = countingBag(Promise.resolve("v"));

    defer({ critical: 0, deferred: bag });

    expect(reads()).toBe(1);
  });

  it("ships the value it validated, not a later read", () => {
    let n = 0;
    const bag = {
      get drifting() {
        n += 1;

        // Read 1 satisfies the thenable guard; read 2 does not. Whichever the
        // payload carries is the one the client will be handed.
        return n === 1 ? Promise.resolve("ok") : "NOT-A-PROMISE";
      },
    } as unknown as Record<string, Promise<unknown>>;

    const payload = defer({ critical: 0, deferred: bag });

    expect(typeof (payload.deferred as Record<string, unknown>).drifting).toBe(
      "object",
    );
  });

  it("snapshots the whole bag, not only its values", () => {
    // `options.deferred` is itself read more than once by the shape gate; a
    // getter there swaps the entire bag between validation and freeze, so the
    // reserved-key check applies to keys that never ship.
    let bagReads = 0;
    const first = { a: Promise.resolve("FIRST") };
    const second = { b: Promise.resolve("SECOND") };
    const options = {
      critical: 0,
      get deferred() {
        bagReads += 1;

        return bagReads === 1 ? first : second;
      },
    };

    const payload = defer(options as unknown as Parameters<typeof defer>[0]);

    expect(Object.keys(payload.deferred as object)).toStrictEqual(["a"]);
  });

  it("CONTROL — a plain bag still ships the caller's own promise objects", () => {
    const promise = Promise.resolve("same");
    const payload = defer({ critical: 0, deferred: { k: promise } });

    expect((payload.deferred as Record<string, unknown>).k).toBe(promise);
  });
});
