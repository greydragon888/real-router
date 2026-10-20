// A listener that tracks the transition in flight has to tell that
// transition's own `TRANSITION_ERROR` from a refusal that starts no transition,
// which core reports on the same event and may report while the transition is
// still in flight (#2779). `@real-router/sources`, `shared/dom-utils` and
// `@real-router/logger-plugin` tell them apart by the state's `context`: a
// transition's own error carries a `toState` with its transition's `context`,
// a refusal never does.
//
// The property holds that rule to core's own answer. A reference listener that
// applies it must say a transition is in flight exactly when
// `isTransitioning()` does, after every step of a random sequence of parked,
// synchronous and signal-failed navigations, refusals of every kind in
// `REFUSALS`, guard verdicts and restarts.

import { test, fc } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { createRouter, events } from "@real-router/core";
import {
  getLifecycleApi,
  getPluginApi,
  getRoutesApi,
} from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

import { NUM_RUNS } from "./helpers";

import type { Router, State } from "@real-router/core";

const REFUSALS = [
  "SAME_STATES",
  "ROUTE_NOT_FOUND",
  "ROUTE_NOT_FOUND at navigateToState",
  "WRONG_CHANNEL",
  "a plugin's emitTransitionError",
] as const;

type Refusal = (typeof REFUSALS)[number];

type Step =
  | {
      kind: "navigate";
      to: "home" | "a" | "b";
      park: boolean;
      // Fails the navigation where its signal is read for the n-th time.
      failRead: number | undefined;
    }
  | { kind: "refuse"; refusal: Refusal }
  | { kind: "verdict"; verdict: "allow" | "deny" | "throw" }
  | { kind: "restart"; park: boolean };

const arbStep: fc.Arbitrary<Step> = fc.oneof(
  fc.record({
    kind: fc.constant("navigate" as const),
    to: fc.constantFrom("home" as const, "a" as const, "b" as const),
    park: fc.boolean(),
    failRead: fc.option(fc.integer({ min: 1, max: 6 }), { nil: undefined }),
  }),
  fc.record({
    kind: fc.constant("refuse" as const),
    refusal: fc.constantFrom(...REFUSALS),
  }),
  fc.record({
    kind: fc.constant("verdict" as const),
    verdict: fc.constantFrom(
      "allow" as const,
      "deny" as const,
      "throw" as const,
    ),
  }),
  fc.record({ kind: fc.constant("restart" as const), park: fc.boolean() }),
);

const noop = (): void => {};

const settle = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

/**
 * A signal whose `aborted` getter throws on read `n`. A failure raised after
 * `completeTransition` writes the committed copy back reports that copy.
 */
function signalFailingAt(n: number): AbortSignal {
  const controller = new AbortController();
  let reads = 0;

  Object.defineProperty(controller.signal, "aborted", {
    get() {
      reads++;

      if (reads === n) {
        throw new Error(`read ${n}`);
      }

      return false;
    },
  });

  return controller.signal;
}

interface Harness {
  router: Router;
  /** What the reference listener believes: a transition is in flight. */
  referenceInFlight: () => boolean;
  /** How many `TRANSITION_ERROR`s the router has emitted. */
  errors: () => number;
  run: (step: Step) => Promise<void>;
  releaseAll: () => void;
}

function createHarness(): Harness {
  const router = createRouter(
    [
      { name: "home", path: "/" },
      { name: "a", path: "/a" },
      { name: "b", path: "/b" },
      { name: "search", path: "/search?q" },
      { name: "gone", path: "/gone" },
    ],
    // WRONG_CHANNEL is not an expected rejection, so core logs it.
    { defaultRoute: "home", logger: { level: "none" } },
  );
  const api = getPluginApi(router);
  const lifecycle = getLifecycleApi(router);

  const goneState = api.makeState("gone", {});

  getRoutesApi(router).remove("gone");

  // Guards park the navigation they are asked about when the step says so.
  let parkNext = false;
  const pending: {
    resolve: (allowed: boolean) => void;
    reject: (error: unknown) => void;
  }[] = [];
  const guard = () => (): boolean | Promise<boolean> => {
    if (!parkNext) {
      return true;
    }

    return new Promise<boolean>((resolve, reject) => {
      pending.push({ resolve, reject });
    });
  };

  for (const name of ["home", "a", "b"]) {
    lifecycle.addActivateGuard(name, guard);
  }

  let errors = 0;

  api.addEventListener(events.TRANSITION_ERROR, () => {
    errors++;
  });

  // The reference listener: the rule under test, and nothing else.
  let inFlight: State | undefined;

  api.addEventListener(events.TRANSITION_START, (toState: State) => {
    inFlight = toState;
  });
  api.addEventListener(events.TRANSITION_SUCCESS, () => {
    inFlight = undefined;
  });
  api.addEventListener(events.TRANSITION_CANCEL, () => {
    inFlight = undefined;
  });
  api.addEventListener(
    events.TRANSITION_ERROR,
    (toState: State | undefined) => {
      if (toState?.context === inFlight?.context) {
        inFlight = undefined;
      }
    },
  );

  const refuse = async (refusal: Refusal): Promise<void> => {
    switch (refusal) {
      case "SAME_STATES": {
        const committed = router.getState();

        if (committed !== undefined) {
          void router.navigate(committed.name).catch(noop);
        }

        break;
      }
      case "ROUTE_NOT_FOUND": {
        void router.navigate("nowhere").catch(noop);

        break;
      }
      case "ROUTE_NOT_FOUND at navigateToState": {
        try {
          await api.navigateToState(goneState);
        } catch {
          // The refusal is the step.
        }

        break;
      }
      case "WRONG_CHANNEL": {
        const state = api.makeState("search", {});

        try {
          await api.navigateToState({ ...state, params: { q: "1" } });
        } catch {
          // The refusal is the step.
        }

        break;
      }
      case "a plugin's emitTransitionError": {
        api.emitTransitionError(new Error("plugin report"));

        break;
      }
    }
  };

  const run = async (step: Step): Promise<void> => {
    switch (step.kind) {
      case "navigate": {
        parkNext = step.park;
        void router
          .navigate(
            step.to,
            {},
            undefined,
            step.failRead === undefined
              ? {}
              : { signal: signalFailingAt(step.failRead) },
          )
          .catch(noop);
        parkNext = false;

        break;
      }
      case "refuse": {
        await refuse(step.refusal);

        break;
      }
      case "verdict": {
        const next = pending.shift();

        if (step.verdict === "throw") {
          next?.reject(new Error("guard threw"));
        } else {
          next?.resolve(step.verdict === "allow");
        }

        break;
      }
      case "restart": {
        router.stop();
        parkNext = step.park;
        void router.start(step.park ? "/a" : "/").catch(noop);
        parkNext = false;

        break;
      }
    }
  };

  return {
    router,
    referenceInFlight: () => inFlight !== undefined,
    errors: () => errors,
    run,
    releaseAll: () => {
      for (const next of pending.splice(0)) {
        next.resolve(true);
      }
    },
  };
}

describe("a transition's own TRANSITION_ERROR is told apart by its context (#2779)", () => {
  test.prop([fc.array(arbStep, { minLength: 1, maxLength: 12 })], {
    numRuns: NUM_RUNS.fast,
  })(
    "a listener that ends the transition only on an error carrying its context agrees with isTransitioning()",
    async (steps) => {
      const harness = createHarness();
      const { router } = harness;

      await router.start("/");

      for (const step of steps) {
        await harness.run(step);
        await settle();

        expect(harness.referenceInFlight()).toBe(
          getInternals(router).isTransitioning(),
        );
      }

      harness.releaseAll();
      await settle();

      expect(getInternals(router).isTransitioning()).toBe(false);
      expect(harness.referenceInFlight()).toBe(false);

      router.stop();
    },
  );

  // The property is vacuous unless a refusal can land inside a parked
  // transition and reach `TRANSITION_ERROR`; this pins both, kind by kind.
  it("POSITIVE CONTROL — every refusal in REFUSALS is reported while a parked transition stays in flight", async () => {
    const harness = createHarness();
    const { router } = harness;

    await router.start("/");
    await harness.run({
      kind: "navigate",
      to: "a",
      park: true,
      failRead: undefined,
    });
    await settle();

    expect(getInternals(router).isTransitioning()).toBe(true);

    for (const refusal of REFUSALS) {
      const before = harness.errors();

      await harness.run({ kind: "refuse", refusal });
      await settle();

      expect(harness.errors()).toBe(before + 1);
      expect(getInternals(router).isTransitioning()).toBe(true);
      expect(harness.referenceInFlight()).toBe(true);
    }

    await harness.run({ kind: "verdict", verdict: "allow" });
    await settle();

    expect(getInternals(router).isTransitioning()).toBe(false);
    expect(harness.referenceInFlight()).toBe(false);

    router.stop();
  });

  // Every read of the signal is a point the transition can fail at; past the
  // write-back of the committed copy the failure carries that copy.
  it("a transition's own error shares its start's context wherever the transition fails", async () => {
    let copies = 0;

    for (let n = 1; n <= 8; n++) {
      const router = createRouter(
        [
          { name: "home", path: "/" },
          { name: "a", path: "/a" },
        ],
        { defaultRoute: "home", logger: { level: "none" } },
      );

      await router.start("/");

      const api = getPluginApi(router);
      let started: State | undefined;
      const failures: (State | undefined)[] = [];

      api.addEventListener(events.TRANSITION_START, (toState: State) => {
        started = toState;
      });
      api.addEventListener(
        events.TRANSITION_ERROR,
        (toState: State | undefined) => {
          failures.push(toState);
        },
      );

      await router
        .navigate("a", {}, undefined, { signal: signalFailingAt(n) })
        .catch(noop);

      for (const toState of failures) {
        expect(toState?.context).toBe(started?.context);

        if (toState !== started) {
          copies++;
        }
      }

      expect(getInternals(router).isTransitioning()).toBe(false);

      router.stop();
    }

    // The sweep reached the commit: some failure carried the copy.
    expect(copies).toBeGreaterThan(0);
  });
});
