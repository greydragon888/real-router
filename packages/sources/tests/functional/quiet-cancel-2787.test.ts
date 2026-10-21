import {
  createRouter,
  errorCodes,
  events,
  RouterError,
} from "@real-router/core";
import { getLifecycleApi, getPluginApi } from "@real-router/core/api";
import { describe, expect, it } from "vitest";

import { createTransitionSource } from "../../src";

import type { RouterTransitionSnapshot } from "../../src";
import type { Router } from "@real-router/core";

// A guard's quiet cancel ends the transition through `TRANSITION_CANCEL`, one
// of the events the snapshot resets on (#2787). Each verdict is raised before
// the leave (deactivation) or after it (activation), so both of the snapshot's
// non-idle shapes are left; the refusal is the control that ends through
// `TRANSITION_ERROR` instead.
const quietCancel = (): boolean => {
  throw new RouterError(errorCodes.TRANSITION_CANCELLED);
};
const refuse = (): boolean => false;

const CELLS = [
  {
    phase: "deactivation",
    verdict: "a quiet cancel",
    decide: quietCancel,
    rejectsWith: errorCodes.TRANSITION_CANCELLED,
    endsWith: events.TRANSITION_CANCEL,
  },
  {
    phase: "activation",
    verdict: "a quiet cancel",
    decide: quietCancel,
    rejectsWith: errorCodes.TRANSITION_CANCELLED,
    endsWith: events.TRANSITION_CANCEL,
  },
  {
    phase: "deactivation",
    verdict: "a refusal (control)",
    decide: refuse,
    rejectsWith: errorCodes.CANNOT_DEACTIVATE,
    endsWith: events.TRANSITION_ERROR,
  },
  {
    phase: "activation",
    verdict: "a refusal (control)",
    decide: refuse,
    rejectsWith: errorCodes.CANNOT_ACTIVATE,
    endsWith: events.TRANSITION_ERROR,
  },
] as const;

/** On the deactivation of `home`, or on the activation of `users`. */
function installVerdict(
  router: Router,
  phase: (typeof CELLS)[number]["phase"],
  decide: () => boolean,
): void {
  const lifecycle = getLifecycleApi(router);

  if (phase === "deactivation") {
    lifecycle.addDeactivateGuard("home", () => decide);
  } else {
    lifecycle.addActivateGuard("users", () => decide);
  }
}

/** The terminal events the router emits, in order. */
function recordTerminals(router: Router): string[] {
  const terminals: string[] = [];
  const api = getPluginApi(router);

  for (const event of [
    events.TRANSITION_SUCCESS,
    events.TRANSITION_ERROR,
    events.TRANSITION_CANCEL,
  ] as const) {
    api.addEventListener(event, () => {
      terminals.push(event);
    });
  }

  return terminals;
}

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

describe("#2787 — a quiet cancel ends the transition snapshot", () => {
  it("the cell table is the full product, each cell once", () => {
    expect(CELLS).toHaveLength(4);
    expect(new Set(CELLS.map((c) => `${c.phase}/${c.verdict}`)).size).toBe(4);
  });

  it.each(CELLS)(
    "$verdict in $phase: back to idle through its terminal event",
    async ({ phase, decide, rejectsWith, endsWith }) => {
      const router = createRouter(
        [
          { name: "home", path: "/" },
          { name: "users", path: "/users" },
        ],
        { defaultRoute: "home" },
      );

      installVerdict(router, phase, decide);

      await router.start("/");
      const source = createTransitionSource(router);
      const transitioning: boolean[] = [];

      source.subscribe(() => {
        transitioning.push(source.getSnapshot().isTransitioning);
      });
      const terminals = recordTerminals(router);

      const outcome = await router.navigate("users").then(
        () => "resolved",
        (error: unknown) => (error as { code?: unknown }).code,
      );

      // The verdict fired, the snapshot left idle, and the transition ended
      // through the event the verdict calls for.
      expect(outcome).toBe(rejectsWith);
      expect(transitioning).toContain(true);
      expect(terminals).toStrictEqual([endsWith]);
      expect(view(source.getSnapshot())).toStrictEqual(IDLE_VIEW);

      source.destroy();
      router.dispose();
    },
  );
});
