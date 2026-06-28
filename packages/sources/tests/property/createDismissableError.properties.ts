import { fc, test } from "@fast-check/vitest";
import { describe, expect, vi } from "vitest";

import { createStartedRouter, NUM_RUNS } from "./helpers";
import { createDismissableError } from "../../src";

// Routes that must always fail to navigate (router throws ROUTE_NOT_FOUND) →
// each navigation produces a distinct error event.
const arbMissingRoute = fc.constantFrom(
  "missing.alpha",
  "missing.beta",
  "missing.gamma",
  "missing.delta",
);

type Action =
  | { kind: "error"; route: string }
  | { kind: "reset" }
  | { kind: "noop-getSnapshot" };

const arbAction: fc.Arbitrary<Action> = fc.oneof(
  arbMissingRoute.map<Action>((route) => ({ kind: "error", route })),
  fc.constant<Action>({ kind: "reset" }),
  fc.constant<Action>({ kind: "noop-getSnapshot" }),
);

const arbActionSeq = fc.array(arbAction, { minLength: 1, maxLength: 30 });

describe("createDismissableError — invariants", () => {
  test.prop([arbActionSeq], { numRuns: NUM_RUNS.standard })(
    "version is non-decreasing across error/reset/getSnapshot cycles",
    async (actions) => {
      const router = await createStartedRouter();
      const source = createDismissableError(router);
      const unsub = source.subscribe(() => {});
      const versions: number[] = [source.getSnapshot().version];

      for (const action of actions) {
        if (action.kind === "error") {
          await router.navigate(action.route).catch(() => {});
        } else if (action.kind === "reset") {
          source.getSnapshot().resetError();
        }

        versions.push(source.getSnapshot().version);
      }

      for (let i = 1; i < versions.length; i++) {
        expect(versions[i]).toBeGreaterThanOrEqual(versions[i - 1]);
      }

      unsub();
      router.stop();
    },
  );

  test.prop([arbActionSeq], { numRuns: NUM_RUNS.standard })(
    "after reset(), error is null until a new error event arrives",
    async (actions) => {
      const router = await createStartedRouter();
      const source = createDismissableError(router);
      const unsub = source.subscribe(() => {});

      for (const action of actions) {
        if (action.kind === "error") {
          await router.navigate(action.route).catch(() => {});

          continue;
        }

        if (action.kind === "reset") {
          source.getSnapshot().resetError();

          expect(source.getSnapshot().error).toBeNull();
          expect(source.getSnapshot().toRoute).toBeNull();
          expect(source.getSnapshot().fromRoute).toBeNull();
        }
      }

      unsub();
      router.stop();
    },
  );

  test.prop([fc.integer({ min: 2, max: 10 })], { numRuns: NUM_RUNS.standard })(
    "resetError() is idempotent — back-to-back calls produce the same snapshot",
    async (resetCount) => {
      const router = await createStartedRouter();
      const source = createDismissableError(router);
      const unsub = source.subscribe(() => {});

      await router.navigate("missing.alpha").catch(() => {});

      expect(source.getSnapshot().error).not.toBeNull();

      source.getSnapshot().resetError();
      const afterFirstReset = source.getSnapshot();

      for (let i = 1; i < resetCount; i++) {
        source.getSnapshot().resetError();
      }

      const afterNReset = source.getSnapshot();

      expect(afterNReset.error).toBeNull();
      expect(afterNReset.version).toBe(afterFirstReset.version);

      unsub();
      router.stop();
    },
  );

  test.prop([arbActionSeq], { numRuns: NUM_RUNS.standard })(
    "subscribers fire only on state-relevant actions (error event or resetError)",
    async (actions) => {
      const router = await createStartedRouter();
      const source = createDismissableError(router);
      const listener = vi.fn();
      const unsub = source.subscribe(listener);

      // Mirror `createDismissableError`'s private `dismissedVersion` (starts
      // at -1) so the oracle can predict the no-op-guard exactly. `resetError`
      // notifies iff `currentVersion > dismissedVersion`; the FIRST reset ever
      // after construction is therefore notified (currentVersion === 0,
      // dismissedVersion === -1) even though no error has occurred yet.
      let mockDismissedVersion = -1;
      let expectedCalls = 0;

      for (const action of actions) {
        if (action.kind === "error") {
          const before = source.getSnapshot().version;

          await router.navigate(action.route).catch(() => {});

          if (source.getSnapshot().version > before) {
            expectedCalls++;
          }
        } else if (action.kind === "reset") {
          const currentVersion = source.getSnapshot().version;

          source.getSnapshot().resetError();

          if (currentVersion > mockDismissedVersion) {
            expectedCalls++;
            mockDismissedVersion = currentVersion;
          }
        }
      }

      // Exact count after the P1 no-op-guard fix in `createDismissableError`.
      expect(listener).toHaveBeenCalledTimes(expectedCalls);

      unsub();
      router.stop();
    },
  );

  test.prop([fc.integer({ min: 1, max: 5 })], { numRuns: NUM_RUNS.standard })(
    "createDismissableError(router) returns the same cached instance",
    async (callCount) => {
      const router = await createStartedRouter();
      const first = createDismissableError(router);

      for (let i = 1; i < callCount; i++) {
        expect(createDismissableError(router)).toBe(first);
      }

      router.stop();
    },
  );

  test.prop([arbMissingRoute, fc.integer({ min: 2, max: 8 })], {
    numRuns: NUM_RUNS.standard,
  })(
    "resetError() no-op-guard: extra resets after dismissal don't notify listeners (audit §6 MEDIUM)",
    async (route, extraResets) => {
      const router = await createStartedRouter();
      const source = createDismissableError(router);
      const listener = vi.fn();
      const unsub = source.subscribe(listener);

      // Trigger ONE error to advance version.
      await router.navigate(route).catch(() => {});
      const callsAfterError = listener.mock.calls.length;

      // First reset transitions dismissedVersion to currentVersion — must
      // notify (error → null transition).
      source.getSnapshot().resetError();
      const callsAfterFirstReset = listener.mock.calls.length;

      expect(callsAfterFirstReset).toBeGreaterThan(callsAfterError);

      // Subsequent resets find `currentVersion <= dismissedVersion` → must NOT
      // notify the listener again.
      for (let i = 0; i < extraResets; i++) {
        source.getSnapshot().resetError();
      }

      expect(listener).toHaveBeenCalledTimes(callsAfterFirstReset);

      unsub();
      router.stop();
    },
  );

  test.prop([arbMissingRoute], { numRuns: NUM_RUNS.standard })(
    "error that occurred before first subscribe is caught up on subscribe (#765 reconnect staleness)",
    async (route) => {
      const router = await createStartedRouter();
      const source = createDismissableError(router); // zero subscribers

      // Error event while the wrapper has ZERO subscribers. The eager underlying
      // getErrorSource captures it; the wrapper snapshot stays stale until the
      // catch-up reconcile on first subscribe (BUG #765.2).
      await router.navigate(route).catch(() => {});

      const listener = vi.fn();
      const unsub = source.subscribe(listener);

      // Without the catch-up, getSnapshot() returns { error: null, version: 0 }.
      expect(source.getSnapshot().error).not.toBeNull();
      // The listener (added before onFirstSubscribe) receives the reconcile.
      expect(listener).toHaveBeenCalled();

      unsub();
      router.stop();
    },
  );
});
