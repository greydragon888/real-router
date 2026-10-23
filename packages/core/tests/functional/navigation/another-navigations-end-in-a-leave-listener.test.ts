import { describe, expect, it } from "vitest";

import { createRouter, errorCodes, RouterError } from "@real-router/core";

import type { LeaveState, Route, Router, State } from "@real-router/core";

/**
 * The leave-listener arm of `another-navigations-end-in-a-guard.test.ts`
 * (#2786, measure 8 of the cheap wave).
 *
 * A `subscribeLeave` listener that waits on work another navigation started —
 * that navigation's promise, or a request bound to its signal — receives that
 * navigation's END when it is cancelled or fails. That is not THIS navigation's
 * quiet cancel (#2787), nor its own failure: the navigation still running fails
 * visibly with `CANNOT_DEACTIVATE` and a `TRANSITION_ERROR`, as it does when a
 * guard holds the same value.
 *
 * The CONTROLS hold the rest: a `RouterError(TRANSITION_CANCELLED)` the
 * listener built is a quiet cancel, a plain error fails the navigation with
 * that error, and the end of the listener's OWN navigation is the cancellation
 * it already was.
 */

type Cell =
  | "it awaits the superseded navigation's promise"
  | "it throws the superseded navigation's signal reason"
  | "it throws that reason beside a listener that returns a promise"
  | "it awaits that promise inside the guard pipeline";

type Control =
  | "a RouterError(TRANSITION_CANCELLED) it built"
  | "a plain Error it rejects with"
  | "its own navigation's end, thrown after stop()";

const CELLS: readonly Cell[] = [
  "it awaits the superseded navigation's promise",
  "it throws the superseded navigation's signal reason",
  "it throws that reason beside a listener that returns a promise",
  "it awaits that promise inside the guard pipeline",
];

const CONTROLS: readonly Control[] = [
  "a RouterError(TRANSITION_CANCELLED) it built",
  "a plain Error it rejects with",
  "its own navigation's end, thrown after stop()",
];

const describeError = (error: unknown): unknown =>
  (error as { code?: unknown }).code ?? (error as Error).message;

const tick = (ms = 0): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

interface Shared {
  /** The superseded navigation's promise. */
  readonly first: Promise<State>;
  /** What the superseded navigation's signal was aborted with. */
  readonly reason: () => unknown;
  readonly leave: LeaveState;
  readonly router: Router;
}

type Listener = (shared: Shared) => void | Promise<void>;

interface Run {
  readonly first: unknown;
  readonly second: unknown;
  readonly state: string | undefined;
  readonly log: string[];
}

/**
 * `p0` holds a request bound to its signal; `p` supersedes it, and the
 * listeners run when the router leaves `home` for `p`.
 */
async function supersede(
  listeners: readonly Listener[],
  options: { readonly guardOnTarget?: boolean } = {},
): Promise<Run> {
  let first: Promise<State> | undefined;
  let reason: unknown;

  const routes: Route[] = [
    { name: "home", path: "/" },
    {
      name: "p0",
      path: "/p0",
      canActivate: () => (_toState, _fromState, signal) =>
        new Promise<boolean>((_resolve, reject) => {
          signal?.addEventListener(
            "abort",
            () => {
              reason = signal.reason;
              reject(reason);
            },
            { once: true },
          );
        }),
    },
    options.guardOnTarget
      ? { name: "p", path: "/p", canActivate: () => () => true }
      : { name: "p", path: "/p" },
  ];
  const router = createRouter(routes);
  const log: string[] = [];

  await router.start("/");

  router.usePlugin(() => ({
    onTransitionStart: (toState: State) => log.push(`START:${toState.name}`),
    onTransitionSuccess: (toState: State) =>
      log.push(`SUCCESS:${toState.name}`),
    onTransitionCancel: (toState: State) => log.push(`CANCEL:${toState.name}`),
    onTransitionError: (
      toState: State | undefined,
      _fromState: State | undefined,
      error: unknown,
    ) => log.push(`ERROR:${toState?.name}:${String(describeError(error))}`),
  }));

  for (const listener of listeners) {
    router.subscribeLeave((leave) =>
      leave.nextRoute.name === "p"
        ? listener({
            first: first!,
            reason: () => reason,
            leave,
            router,
          })
        : undefined,
    );
  }

  first = router.navigate("p0");

  const firstOutcome = first.then(() => "resolved").catch(describeError);

  await tick();

  const second = await router
    .navigate("p")
    .then(() => "resolved")
    .catch(describeError);

  await tick(10);

  const run: Run = {
    first: await firstOutcome,
    second,
    state: router.getState()?.name,
    log,
  };

  router.dispose();

  return run;
}

const awaitFirst: Listener = async ({ first }) => {
  await first;
};

function runCell(cell: Cell): Promise<Run> {
  switch (cell) {
    case "it awaits the superseded navigation's promise": {
      return supersede([awaitFirst]);
    }
    case "it throws the superseded navigation's signal reason": {
      return supersede([
        ({ reason }) => {
          throw reason();
        },
      ]);
    }
    case "it throws that reason beside a listener that returns a promise": {
      return supersede([
        ({ reason }) => {
          throw reason();
        },
        () => Promise.resolve(),
      ]);
    }
    case "it awaits that promise inside the guard pipeline": {
      return supersede([awaitFirst], { guardOnTarget: true });
    }
  }
}

describe("a leave listener waiting on another navigation's work fails when that navigation is cancelled", () => {
  it("the cell tables hold each cell once", () => {
    expect(CELLS).toHaveLength(new Set(CELLS).size);
    expect(CONTROLS).toHaveLength(new Set(CONTROLS).size);
    expect(CELLS.length + CONTROLS.length).toBe(7);
  });

  it.each(CELLS)(
    "%s: TRANSITION_ERROR with CANNOT_DEACTIVATE, not TRANSITION_CANCEL",
    async (cell) => {
      const run = await runCell(cell);

      expect(run.first).toBe(errorCodes.TRANSITION_CANCELLED);
      expect(run.second).toBe(errorCodes.CANNOT_DEACTIVATE);
      expect(run.log).toStrictEqual([
        "START:p0",
        "CANCEL:p0",
        "START:p",
        `ERROR:p:${errorCodes.CANNOT_DEACTIVATE}`,
      ]);
      expect(run.state).toBe("home");
    },
  );
});

describe("a leave listener waiting on another navigation's work fails when that navigation fails", () => {
  it("throws what a refused navigation's signal was aborted with: CANNOT_DEACTIVATE, not that navigation's CANNOT_ACTIVATE", async () => {
    let refusedSignal: AbortSignal | undefined;
    const router = createRouter([
      { name: "home", path: "/" },
      {
        name: "refused",
        path: "/refused",
        canActivate: () => async (_toState, _fromState, signal) => {
          refusedSignal = signal;
          await Promise.resolve();

          return false;
        },
      },
      { name: "p", path: "/p" },
    ]);
    const log: string[] = [];

    await router.start("/");
    router.usePlugin(() => ({
      onTransitionError: (
        toState: State | undefined,
        _fromState: State | undefined,
        error: unknown,
      ) => log.push(`ERROR:${toState?.name}:${String(describeError(error))}`),
    }));

    const first = await router
      .navigate("refused")
      .then(() => "resolved")
      .catch(describeError);

    router.subscribeLeave((leave) => {
      if (leave.nextRoute.name === "p") {
        throw refusedSignal?.reason;
      }
    });

    const second = await router
      .navigate("p")
      .then(() => "resolved")
      .catch(describeError);

    expect(first).toBe(errorCodes.CANNOT_ACTIVATE);
    expect(describeError(refusedSignal?.reason)).toBe(
      errorCodes.CANNOT_ACTIVATE,
    );
    expect(second).toBe(errorCodes.CANNOT_DEACTIVATE);
    expect(log).toStrictEqual([
      `ERROR:refused:${errorCodes.CANNOT_ACTIVATE}`,
      `ERROR:p:${errorCodes.CANNOT_DEACTIVATE}`,
    ]);
    expect(router.getState()?.name).toBe("home");

    router.dispose();
  });
});

describe("controls — what the listener raised itself, and its own navigation's end", () => {
  it.each(CONTROLS)("%s", async (control) => {
    switch (control) {
      case "a RouterError(TRANSITION_CANCELLED) it built": {
        const run = await supersede([
          () => {
            throw new RouterError(errorCodes.TRANSITION_CANCELLED);
          },
        ]);

        expect(run.second).toBe(errorCodes.TRANSITION_CANCELLED);
        expect(run.log.at(-1)).toBe("CANCEL:p");

        return;
      }
      case "a plain Error it rejects with": {
        const run = await supersede([
          async () => {
            await Promise.resolve();

            throw new Error("leave failed");
          },
        ]);

        expect(run.second).toBe("leave failed");
        expect(run.log.at(-1)).toBe("ERROR:p:leave failed");

        return;
      }
      case "its own navigation's end, thrown after stop()": {
        const run = await supersede([
          ({ leave, router }) => {
            router.stop();

            throw leave.signal.reason;
          },
        ]);

        expect(run.second).toBe(errorCodes.TRANSITION_CANCELLED);
        expect(run.log.at(-1)).toBe("CANCEL:p");
      }
    }
  });
});
