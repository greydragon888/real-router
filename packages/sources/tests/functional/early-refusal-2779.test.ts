import { createRouter, events } from "@real-router/core";
import { getLifecycleApi, getPluginApi } from "@real-router/core/api";
import { describe, expect, it } from "vitest";

import { createTransitionSource } from "../../src";

import type { RouterTransitionSnapshot } from "../../src";
import type { Router, State } from "@real-router/core";

// Core reports a refusal that starts no transition on `TRANSITION_ERROR`, with
// no `TRANSITION_START` before it, and it may do so while another transition
// is in flight (#2779). Each refusal below reaches a different emission site.
const REFUSALS: Record<string, (router: Router) => Promise<unknown> | void> = {
  SAME_STATES: (router) => router.navigate("home").catch(() => {}),
  ROUTE_NOT_FOUND: (router) => router.navigate("nowhere").catch(() => {}),
  "WRONG_CHANNEL at navigateToState": async (router) => {
    const api = getPluginApi(router);
    const state = api.makeState("search", {});

    try {
      await api.navigateToState({ ...state, params: { q: "1" } });
    } catch {
      // The refusal is the point.
    }
  },
  "a plugin's emitTransitionError": (router) => {
    getPluginApi(router).emitTransitionError(new Error("plugin report"));
  },
};

// Where the transition is held: by the deactivation guard, before the leave,
// or by the activation guard, after it.
const WINDOWS = ["before the leave", "after the leave"] as const;

type Window = (typeof WINDOWS)[number];

const view = (snapshot: RouterTransitionSnapshot) => ({
  isTransitioning: snapshot.isTransitioning,
  isLeaveApproved: snapshot.isLeaveApproved,
  toRoute: snapshot.toRoute?.name ?? null,
  fromRoute: snapshot.fromRoute?.name ?? null,
});

const IDLE_VIEW = {
  isTransitioning: false,
  isLeaveApproved: false,
  toRoute: null,
  fromRoute: null,
};

function createFixtureRouter(): Router {
  return createRouter(
    [
      { name: "home", path: "/" },
      { name: "users", path: "/users" },
      { name: "search", path: "/search?q" },
    ],
    // The WRONG_CHANNEL refusal is not an expected rejection, so core logs it.
    { defaultRoute: "home", logger: { level: "none" } },
  );
}

/** Counts the `TRANSITION_ERROR`s the router emits. */
function countErrors(router: Router): () => number {
  let errors = 0;

  getPluginApi(router).addEventListener(events.TRANSITION_ERROR, () => {
    errors++;
  });

  return () => errors;
}

async function heldTransition(
  window: Window,
  refuse: ((router: Router) => Promise<unknown> | void) | undefined,
  allow = true,
) {
  const router = createFixtureRouter();

  await router.start("/");

  let release!: (allowed: boolean) => void;
  const hold = () =>
    new Promise<boolean>((resolve) => {
      release = resolve;
    });
  const lifecycle = getLifecycleApi(router);

  if (window === "before the leave") {
    lifecycle.addDeactivateGuard("home", () => hold);
  } else {
    lifecycle.addActivateGuard("users", () => hold);
  }

  const errors = countErrors(router);
  const source = createTransitionSource(router);
  const navigation = router.navigate("users").catch(() => {});

  // The guard is pending only once the pipeline has reached it.
  await Promise.resolve();

  const held = view(source.getSnapshot());

  await refuse?.(router);

  const afterRefusal = view(source.getSnapshot());
  const refusalErrors = errors();

  release(allow);
  await navigation;

  const settled = view(source.getSnapshot());

  source.destroy();
  router.stop();

  return { held, afterRefusal, settled, refusalErrors };
}

describe("createTransitionSource — a refusal that starts no transition (#2779)", () => {
  describe.each(WINDOWS)("a transition held %s", (window) => {
    it.each(Object.keys(REFUSALS))(
      "an unrelated %s refusal leaves the snapshot as the control has it",
      async (refusal) => {
        const control = await heldTransition(window, undefined);
        const outcome = await heldTransition(window, REFUSALS[refusal]);

        // The control is what the comparison stands on: a held transition,
        // then the idle snapshot once it commits.
        expect(control.held).toStrictEqual({
          isTransitioning: true,
          isLeaveApproved: window === "after the leave",
          toRoute: "users",
          fromRoute: "home",
        });
        expect(control.settled).toStrictEqual(IDLE_VIEW);

        // The refusal reached `TRANSITION_ERROR`.
        expect(control.refusalErrors).toBe(0);
        expect(outcome.refusalErrors).toBe(1);

        expect({ ...outcome, refusalErrors: 0 }).toStrictEqual(control);
      },
    );

    it.each(Object.keys(REFUSALS))(
      "the transition's own error still ends it after an unrelated %s refusal",
      async (refusal) => {
        const outcome = await heldTransition(window, REFUSALS[refusal], false);

        expect(outcome.afterRefusal.isTransitioning).toBe(true);
        expect(outcome.settled).toStrictEqual(IDLE_VIEW);
      },
    );
  });

  it("a SAME_STATES refusal equal to the transition in flight in all but its context leaves it in flight", async () => {
    const router = createFixtureRouter();

    await router.start("/users");

    let release!: () => void;

    // A reload of the active route runs no activation guard: hold it in a
    // leave listener instead.
    router.subscribeLeave(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );

    const errors = countErrors(router);
    const source = createTransitionSource(router);
    const navigation = router
      .navigate("users", {}, undefined, { reload: true })
      .catch(() => {});

    await Promise.resolve();

    // Refused against the committed `users`: the same name, params and path
    // as the reload in flight.
    await router.navigate("users").catch(() => {});

    expect(errors()).toBe(1);
    expect(view(source.getSnapshot())).toStrictEqual({
      isTransitioning: true,
      isLeaveApproved: true,
      toRoute: "users",
      fromRoute: "users",
    });

    release();
    await navigation;

    expect(view(source.getSnapshot())).toStrictEqual(IDLE_VIEW);

    source.destroy();
    router.stop();
  });

  it("a source created after the start still ends with the transition's own error", async () => {
    const router = createFixtureRouter();

    await router.start("/");

    let release!: (allowed: boolean) => void;
    const lifecycle = getLifecycleApi(router);

    lifecycle.addDeactivateGuard(
      "home",
      () => () =>
        new Promise<boolean>((resolve) => {
          release = resolve;
        }),
    );
    lifecycle.addActivateGuard("users", () => () => false);

    const navigation = router.navigate("users").catch(() => {});

    await Promise.resolve();

    // Created between the start and the leave: it hears only the leave.
    const source = createTransitionSource(router);
    const shown: boolean[] = [];

    source.subscribe(() => {
      shown.push(source.getSnapshot().isTransitioning);
    });

    release(true);
    await navigation;

    // It heard the leave, then the transition's own error.
    expect(shown).toStrictEqual([true, false]);
    expect(router.getState()?.name).toBe("home");
    expect(view(source.getSnapshot())).toStrictEqual(IDLE_VIEW);

    source.destroy();
    router.stop();
  });

  // A failure the commit itself raises carries the committed copy of the
  // state, not the object the start did. A signal whose `aborted` getter
  // throws on read `n` fails the transition at each point it is read.
  it("a transition that fails wherever its signal is read ends idle", async () => {
    let copies = 0;

    for (let n = 1; n <= 8; n++) {
      const router = createFixtureRouter();

      await router.start("/");

      const api = getPluginApi(router);
      let started: State | undefined;

      api.addEventListener(events.TRANSITION_START, (toState: State) => {
        started = toState;
      });
      api.addEventListener(
        events.TRANSITION_ERROR,
        (toState: State | undefined) => {
          if (toState !== undefined && toState !== started) {
            copies++;
          }
        },
      );

      const source = createTransitionSource(router);
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

      await router
        .navigate("users", {}, undefined, { signal: controller.signal })
        .catch(() => {});

      expect(view(source.getSnapshot())).toStrictEqual(IDLE_VIEW);

      source.destroy();
      router.stop();
    }

    // The sweep reached the commit: some failure carried the copy.
    expect(copies).toBeGreaterThan(0);
  });
});
