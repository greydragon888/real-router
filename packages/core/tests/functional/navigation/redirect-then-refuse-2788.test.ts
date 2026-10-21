import { describe, it, expect } from "vitest";

import { createRouter, errorCodes } from "@real-router/core";

import type { Route, Router, State } from "@real-router/core";
import type { Router as GuardRouter } from "@real-router/core/types";

/**
 * #2788 — a guard that redirects and then refuses has handed the band to the
 * redirect. Its own navigation is cancelled — the stream announces
 * `TRANSITION_CANCEL` for it — so its promise rejects `TRANSITION_CANCELLED`
 * whatever the redirect does next: commit at once, or wait on an async guard.
 *
 * The free target is the CONTROL: the redirect commits before the refusal
 * returns, so the machine holds no transition by then.
 */

type Phase = "canActivate" | "canDeactivate";
type Target = "held" | "free";

const PHASES: readonly Phase[] = ["canActivate", "canDeactivate"];
const TARGETS: readonly Target[] = ["held", "free"];
const CELLS = PHASES.flatMap((phase) =>
  TARGETS.map((target) => [phase, target] as const),
);

const codeOf = (error: unknown): unknown =>
  (error as { code?: unknown } | undefined)?.code;

interface Fixture {
  readonly router: Router;
  readonly log: string[];
  readonly release: () => void;
  readonly redirect: () => Promise<unknown> | undefined;
}

function createFixture(phase: Phase, target: Target): Fixture {
  let releaseHeld!: () => void;
  const heldGate = new Promise<boolean>((resolve) => {
    releaseHeld = () => {
      resolve(true);
    };
  });
  let redirect: Promise<unknown> | undefined;
  let redirected = false;

  // Redirects and refuses on its FIRST call only: the redirect leaves the
  // current route too, and the deactivate cell would otherwise redirect again.
  const redirectThenRefuse = (router: GuardRouter) => (): boolean => {
    if (redirected) {
      return true;
    }

    redirected = true;
    redirect = router.navigate(target).catch(codeOf);

    return false;
  };

  const routes: Route[] = [
    { name: "home", path: "/" },
    { name: "free", path: "/free" },
    { name: "held", path: "/held", canActivate: () => () => heldGate },
    phase === "canActivate"
      ? { name: "redir", path: "/redir", canActivate: redirectThenRefuse }
      : { name: "redir", path: "/redir" },
    phase === "canDeactivate"
      ? { name: "x", path: "/x", canDeactivate: redirectThenRefuse }
      : { name: "x", path: "/x" },
  ];
  const router = createRouter(routes, { defaultRoute: "home" });
  const log: string[] = [];

  router.usePlugin(() => ({
    onTransitionStart: (toState: State) => log.push(`START:${toState.name}`),
    onTransitionSuccess: (toState: State) =>
      log.push(`SUCCESS:${toState.name}`),
    onTransitionCancel: (toState: State) => log.push(`CANCEL:${toState.name}`),
    onTransitionError: (
      toState: State | undefined,
      _fromState: State | undefined,
      error: unknown,
    ) => log.push(`ERROR:${toState?.name}:${String(codeOf(error))}`),
  }));

  return {
    router,
    log,
    release: releaseHeld,
    redirect: () => redirect,
  };
}

describe("#2788 — a guard that redirects and then refuses: its navigation was cancelled", () => {
  it("the cell table holds every phase × target, each once", () => {
    expect(CELLS).toHaveLength(PHASES.length * TARGETS.length);
    expect(new Set(CELLS.map((cell) => cell.join(":"))).size).toBe(
      CELLS.length,
    );
  });

  it.each(CELLS)(
    "%s redirecting to the %s route: the promise rejects TRANSITION_CANCELLED, as the stream announced",
    async (phase, target) => {
      const { router, log, release, redirect } = createFixture(phase, target);
      // The navigation the redirecting guard belongs to: `redir` is guarded by
      // its own canActivate; `home` leaves `x`, whose canDeactivate redirects.
      const refused = phase === "canActivate" ? "redir" : "home";

      await router.start(phase === "canActivate" ? "/" : "/x");
      log.length = 0;

      const outcome = await router
        .navigate(refused)
        .then(() => "resolved")
        .catch(codeOf);

      release();

      await expect(redirect()).resolves.toMatchObject({ name: target });

      expect(outcome).toBe(errorCodes.TRANSITION_CANCELLED);
      expect(log).toStrictEqual([
        `START:${refused}`,
        `CANCEL:${refused}`,
        `START:${target}`,
        `SUCCESS:${target}`,
      ]);
      expect(router.getState()?.name).toBe(target);

      router.dispose();
    },
  );
});
