import { describe, it, expect } from "vitest";

import { createRouter, errorCodes } from "@real-router/core";
import { getLifecycleApi, getPluginApi } from "@real-router/core/api";

import type { Router } from "@real-router/core";

/**
 * #1716 — the cancellability scope is closed by the ACTION of the terminal edge
 * the navigation left the band through, and by nothing else.
 *
 * Detaching the bridge from the caller's `opts.signal` used to be the
 * pipeline's, spread over four settle sites (#1688). It is now one operation
 * owned by the machine: `CANCEL`, `FAIL` and `COMPLETE` each close the scope
 * from their action, and the pipeline closes nothing at all.
 *
 * ⚑ **The residual went by moving the OPENING, not the closing (#1724).** One
 * site survived #1716 — in `beginTransition`, for the navigation the machine
 * never ADOPTED, since a `NAVIGATE` that is a table no-op has no edge to close
 * it and the bridge stood before the send. Opening the scope from the
 * `NAVIGATE` action instead means a refused edge runs no action, so such a
 * navigation carries nothing to close; the `onTransitionStart` window stays
 * covered because the action runs before the event is emitted (#1684).
 *
 * ⚠ **This file counts, because the defect it guards is INVISIBLE otherwise.**
 * A leaked listener sits on the application's own `AbortController`, which
 * outlives the navigation. It changes no outcome, no event and no state, so the
 * whole tier stays green: measured, dropping the closing from the `CANCEL`
 * action leaks listeners across 4056 passing tests, and so does re-installing
 * the late bridge for an already-cancelled navigation. Both survivors were found
 * by instrumenting the tier, not by a red test — which is exactly why the
 * balance is asserted here rather than inferred from behaviour.
 *
 * The one arc that IS behaviourally observable gets its own test at the bottom:
 * a bridge left behind by a superseded navigation answers a LATER abort of the
 * same signal and cancels a navigation that has nothing to do with it.
 */

/* eslint-disable vitest/no-standalone-expect -- every `expect` below runs inside
   the `it.each` runner; the rule only sees that the arcs are declared in a
   module-level table, which is the point of the design. */

/** An `AbortController` whose signal counts the abort listeners put on it. */
function countingController(): {
  controller: AbortController;
  counts: () => { added: number; removed: number };
} {
  const controller = new AbortController();
  const { signal } = controller;
  const add = signal.addEventListener.bind(signal);
  const remove = signal.removeEventListener.bind(signal);
  let added = 0;
  let removed = 0;

  signal.addEventListener = ((
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ) => {
    if (type === "abort") {
      added += 1;
    }

    add(type as "abort", listener as EventListener, options);
  }) as typeof signal.addEventListener;

  signal.removeEventListener = ((
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions,
  ) => {
    if (type === "abort") {
      removed += 1;
    }

    remove(type as "abort", listener as EventListener, options);
  }) as typeof signal.removeEventListener;

  return { controller, counts: () => ({ added, removed }) };
}

const ROUTES = [
  { name: "a", path: "/a" },
  { name: "b", path: "/b" },
  { name: "c", path: "/c" },
];

const settle = async (promise: Promise<unknown>): Promise<string> =>
  promise.then(
    () => "resolved",
    (error: unknown) => (error as { code?: string }).code ?? "threw",
  );

interface Arc {
  readonly name: string;
  /** The terminal edge this arc is expected to leave the band through. */
  readonly edge: string;
  /**
   * How many bridges the arc registers on the caller's signal. Pinned rather
   * than asserted as "> 0" so a zero cannot pass vacuously — and because the
   * one arc that registers NONE is itself the assertion (#1704 + #1716).
   */
  readonly registrations: number;
  readonly run: (router: Router, controller: AbortController) => Promise<void>;
}

const ARCS: readonly Arc[] = [
  {
    name: "success with a pre-commit listener (early bridge)",
    edge: "COMPLETE",
    registrations: 1,
    run: async (router, controller) => {
      router.usePlugin(() => ({ onTransitionStart: () => undefined }));

      await router.navigate("b", {}, undefined, { signal: controller.signal });
    },
  },
  {
    name: "success through a guard (late bridge)",
    edge: "COMPLETE",
    registrations: 1,
    run: async (router, controller) => {
      getLifecycleApi(router).addActivateGuard("b", () => () => true);

      await router.navigate("b", {}, undefined, { signal: controller.signal });
    },
  },
  {
    // The arc that reaches BOTH of the bridge's moments — the early one in the
    // `NAVIGATE` action (a pre-commit listener exists) and the late one in
    // `bridgeLateIfOnlyGuardsCanAbort` (this transition walks a guard). ONE
    // registration, because the implementation owns "is a bridge standing?" and
    // the second ask returns early (#1724).
    //
    // ⚠ This is the direct pin of that idempotency, and it is not decoration: a
    // second registration would ORPHAN the first, leaving a listener on the
    // application's own controller that nothing ever removes — invisible to
    // every outcome, every event and every state, which is why it is COUNTED
    // here. (`bridge-implies-suspendable-1705`'s all-true cell reds on the same
    // mutation, but it lives in the file this change had to edit, so the
    // property keeps a pin of its own.)
    name: "both moments apply: a pre-commit listener AND a guard",
    edge: "COMPLETE",
    registrations: 1,
    run: async (router, controller) => {
      router.usePlugin(() => ({ onTransitionStart: () => undefined }));
      getLifecycleApi(router).addActivateGuard("b", () => () => true);

      await router.navigate("b", {}, undefined, { signal: controller.signal });
    },
  },
  {
    name: "failure: a throwing guard",
    edge: "FAIL",
    registrations: 1,
    run: async (router, controller) => {
      getLifecycleApi(router).addActivateGuard("b", () => () => {
        throw new Error("boom");
      });

      await expect(
        settle(
          router.navigate("b", {}, undefined, { signal: controller.signal }),
        ),
      ).resolves.toBe(errorCodes.CANNOT_ACTIVATE);
    },
  },
  {
    name: "cancellation: the caller aborts the signal mid-flight",
    edge: "CANCEL",
    registrations: 1,
    run: async (router, controller) => {
      getLifecycleApi(router).addActivateGuard(
        "b",
        () => () => new Promise<boolean>(() => undefined),
      );

      const navigation = router.navigate("b", {}, undefined, {
        signal: controller.signal,
      });

      await Promise.resolve();
      controller.abort(new Error("cancelled by the app"));

      await expect(settle(navigation)).resolves.toBe(
        errorCodes.TRANSITION_CANCELLED,
      );
    },
  },
  {
    name: "cancellation: superseded, its own signal never aborted",
    edge: "CANCEL",
    registrations: 1,
    run: async (router, controller) => {
      getLifecycleApi(router).addActivateGuard(
        "b",
        () => () => new Promise<boolean>(() => undefined),
      );

      const superseded = router.navigate("b", {}, undefined, {
        signal: controller.signal,
      });

      await Promise.resolve();

      const superseding = router.navigate("c");

      await expect(settle(superseded)).resolves.toBe(
        errorCodes.TRANSITION_CANCELLED,
      );
      await expect(settle(superseding)).resolves.toBe("resolved");
    },
  },
  {
    name: "born dead: the machine never adopted the navigation",
    edge: "none — and nothing was opened either (#1724)",
    // ZERO, and that IS the assertion — the point of #1724. Opening the scope is
    // the `NAVIGATE` action's job, and a `NAVIGATE` the table refuses runs no
    // action, so this navigation carries no bridge to close. It used to carry
    // one (the registration stood before the send) and `beginTransition` closed
    // it by hand — the last place where the pipeline decided the scope's
    // LIFETIME.
    registrations: 0,
    run: async (router, controller) => {
      router.usePlugin(() => ({ onTransitionStart: () => undefined }));
      getPluginApi(router).addInterceptor("forwardState", (next, ...args) => {
        router.stop();

        return next(...args);
      });

      await expect(
        settle(
          router.navigate("b", {}, undefined, { signal: controller.signal }),
        ),
      ).resolves.toBe(errorCodes.TRANSITION_CANCELLED);
    },
  },
  {
    name: "#1704 arc: an opts getter aborts before the announce, and a guard follows",
    edge: "CANCEL (from the adoption, before the late bridge would run)",
    // ZERO, and that IS the assertion. The adoption sends `CANCEL` right after
    // the announce, so by the time `bridgeLateIfOnlyGuardsCanAbort` runs the
    // scope is already CLOSED — installing a listener there would leave one
    // nothing could ever remove, on a signal the application still holds.
    registrations: 0,
    run: async (router, controller) => {
      getLifecycleApi(router).addActivateGuard("b", () => () => true);

      let armed = false;
      // On the TARGET so the entry door's own-enumerable walk asks for it
      // (#1962); otherwise the getter never fires and the arc measures nothing.
      const opts = new Proxy(
        { signal: controller.signal, forceDeactivate: undefined },
        {
          get(target, property, receiver) {
            if (property === "forceDeactivate" && armed) {
              controller.abort(new Error("cancelled from an opts getter"));
            }

            return Reflect.get(target, property, receiver) as unknown;
          },
        },
      );

      armed = true;

      await expect(
        settle(router.navigate("b", {}, undefined, opts)),
      ).resolves.toBe(errorCodes.TRANSITION_CANCELLED);
    },
  },
];

describe("#1716 — the scope closes on the terminal edge, on every arc", () => {
  it.each(ARCS)("$name → $edge", async ({ registrations, run }: Arc) => {
    const router = createRouter(ROUTES);
    const { controller, counts } = countingController();

    await router.start("/a");

    try {
      await run(router, controller);
    } finally {
      const { added, removed } = counts();

      // The pinned shape of the arc — a vacuous zero cannot pass for a
      // balanced one.
      expect(added).toBe(registrations);
      // THE assertion: the caller's signal is left exactly as it was found.
      expect(removed).toBe(added);

      router.dispose();
    }
  });

  it("a superseded navigation's bridge does not cancel a later one", async () => {
    const router = createRouter(ROUTES);
    const reused = new AbortController();

    await router.start("/a");

    // First navigation: parked on a guard, carrying the caller's signal.
    getLifecycleApi(router).addActivateGuard(
      "b",
      () => () => new Promise<boolean>(() => undefined),
    );

    const superseded = router.navigate("b", {}, undefined, {
      signal: reused.signal,
    });

    await Promise.resolve();

    // Second navigation, superseding the first and parked in its turn — so a
    // stale abort has something live to bite.
    let release!: (value: boolean) => void;
    const gate = new Promise<boolean>((resolve) => {
      release = resolve;
    });

    getLifecycleApi(router).addActivateGuard("c", () => () => gate);

    const later = router.navigate("c");

    await expect(settle(superseded)).resolves.toBe(
      errorCodes.TRANSITION_CANCELLED,
    );

    // The first navigation is over and its signal belongs to the application,
    // which is free to abort it whenever it likes. A bridge left behind would
    // route that abort onto FSM `CANCEL` and kill the navigation in flight.
    reused.abort(new Error("the app aborts its own controller afterwards"));
    release(true);

    await expect(settle(later)).resolves.toBe("resolved");
    expect(router.getState()?.name).toBe("c");

    router.dispose();
  });
});
