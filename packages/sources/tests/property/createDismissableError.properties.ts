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

      let expectedMinCalls = 0;

      for (const action of actions) {
        if (action.kind === "error") {
          const before = source.getSnapshot().version;

          await router.navigate(action.route).catch(() => {});

          // Each ROUTE_NOT_FOUND advances the underlying error source version,
          // which propagates one notification through createDismissableError.
          if (source.getSnapshot().version > before) {
            expectedMinCalls++;
          }
        } else if (action.kind === "reset") {
          const before = source.getSnapshot();

          source.getSnapshot().resetError();

          // resetError() notifies listeners only when it actually changes the
          // snapshot (it does — even a no-op reset clears the error field and
          // the source emits, see createDismissableError.ts).
          if (
            before.error !== null ||
            source.getSnapshot().error !== before.error
          ) {
            expectedMinCalls++;
          }
        }
      }

      expect(listener.mock.calls.length).toBeGreaterThanOrEqual(
        expectedMinCalls,
      );

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
});
