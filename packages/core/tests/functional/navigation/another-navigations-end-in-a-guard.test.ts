import { describe, expect, it } from "vitest";

import { createRouter, errorCodes, RouterError } from "@real-router/core";

import type { Route, Router, State } from "@real-router/core";

/**
 * A guard that waits on work another navigation started — a request
 * deduplicated across navigations, or that navigation's own promise — receives
 * that navigation's END when it is cancelled: what core aborted its signal
 * with, or what its promise rejected with. That is not THIS navigation's quiet
 * cancel (#933): the navigation still running fails visibly, `CANNOT_ACTIVATE`
 * or `CANNOT_DEACTIVATE` with a `TRANSITION_ERROR`, instead of leaving through
 * `TRANSITION_CANCEL`.
 *
 * The CONTROLS hold #933 itself: a guard's own `RouterError(TRANSITION_CANCELLED)`
 * or `AbortError` is still a quiet cancel, and so is the end of its OWN
 * navigation. A fresh `AbortError` minted by someone else's request carries no
 * identity, so it stays a quiet cancel — the contract, not a choice made here.
 * So does a value the APPLICATION handed in, whichever navigation ended with
 * it: the reason a caller aborted its `opts.signal` with, one cancel a guard
 * throws on every navigation.
 */

type Cell =
  | "request rejects with the superseded navigation's signal reason"
  | "the same reason, thrown synchronously"
  | "the superseded navigation's own promise"
  | "a canDeactivate guard on the request";

type Control =
  | "a request of its own, nothing cancels it"
  | "the request rejects a plain Error"
  | "its own RouterError(TRANSITION_CANCELLED), rejected"
  | "its own RouterError(TRANSITION_CANCELLED), thrown"
  | "its own AbortError"
  | "a fresh AbortError from the request (no identity)"
  | "the reason the superseded navigation's caller aborted it with (the caller's own)";

const CELLS: readonly Cell[] = [
  "request rejects with the superseded navigation's signal reason",
  "the same reason, thrown synchronously",
  "the superseded navigation's own promise",
  "a canDeactivate guard on the request",
];

const CONTROLS: readonly Control[] = [
  "a request of its own, nothing cancels it",
  "the request rejects a plain Error",
  "its own RouterError(TRANSITION_CANCELLED), rejected",
  "its own RouterError(TRANSITION_CANCELLED), thrown",
  "its own AbortError",
  "a fresh AbortError from the request (no identity)",
  "the reason the superseded navigation's caller aborted it with (the caller's own)",
];

const codeOf = (error: unknown): unknown =>
  (error as { code?: unknown } | undefined)?.code;

const tick = (ms = 0): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

interface Run {
  readonly first: unknown;
  readonly second: unknown;
  readonly state: string | undefined;
  readonly log: string[];
}

/**
 * `p0` starts a request bound to its signal; `p` supersedes it and waits on
 * whatever `wait` hands its guard. The request settles the way `settleOnAbort`
 * says once `p0`'s signal aborts.
 */
async function supersede(options: {
  readonly settleOnAbort: (signal: AbortSignal) => unknown;
  readonly wait: (shared: {
    readonly request: Promise<boolean>;
    readonly first: Promise<State>;
    readonly rejection: () => unknown;
    readonly signal: AbortSignal | undefined;
  }) => boolean | Promise<boolean>;
  readonly phase?: "canActivate" | "canDeactivate";
  readonly callerAborts?: boolean;
}): Promise<Run> {
  let request: Promise<boolean> | undefined;
  let rejection: unknown;
  let first: Promise<State> | undefined;

  const requestGuard = (): ((
    toState: State,
    fromState: State | undefined,
    signal?: AbortSignal,
  ) => Promise<boolean>) => {
    return (_toState, _fromState, signal) => {
      request = new Promise<boolean>((resolve, reject) => {
        const timer = setTimeout(() => {
          resolve(true);
        }, 30);

        signal?.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            rejection = options.settleOnAbort(signal);
            reject(rejection);
          },
          { once: true },
        );
      });
      request.catch(() => {});

      return request;
    };
  };

  const waiting = (): ((
    toState: State,
    fromState: State | undefined,
    signal?: AbortSignal,
  ) => boolean | Promise<boolean>) => {
    // Only `p` waits: leaving `x` for `p0` is how `p0` gets to start the request.
    return (toState, _fromState, signal) =>
      toState.name !== "p" ||
      options.wait({
        request: request!,

        first: first!,
        rejection: () => rejection,
        signal,
      });
  };

  const routes: Route[] =
    options.phase === "canDeactivate"
      ? [
          { name: "home", path: "/" },
          { name: "p0", path: "/p0", canActivate: requestGuard },
          { name: "p", path: "/p" },
          { name: "x", path: "/x", canDeactivate: waiting },
        ]
      : [
          { name: "home", path: "/" },
          { name: "p0", path: "/p0", canActivate: requestGuard },
          { name: "p", path: "/p", canActivate: waiting },
        ];
  const router: Router = createRouter(routes, { defaultRoute: "home" });
  const log: string[] = [];

  await router.start(options.phase === "canDeactivate" ? "/x" : "/");

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

  const controller = new AbortController();

  first = router.navigate(
    "p0",
    {},
    undefined,
    options.callerAborts ? { signal: controller.signal } : {},
  );

  const firstOutcome = first.then(() => "resolved").catch(codeOf);

  await tick();

  if (options.callerAborts) {
    controller.abort();
    await firstOutcome;
  }

  const second = await router
    .navigate("p")
    .then(() => "resolved")
    .catch(codeOf);

  await tick(40);

  const run: Run = {
    first: await firstOutcome,
    second,
    state: router.getState()?.name,
    log,
  };

  router.dispose();

  return run;
}

const reasonOf = (signal: AbortSignal): unknown => signal.reason;

function runCell(cell: Cell): Promise<Run> {
  switch (cell) {
    case "request rejects with the superseded navigation's signal reason": {
      return supersede({
        settleOnAbort: reasonOf,
        wait: ({ request }) => request.then(() => true),
      });
    }
    case "the same reason, thrown synchronously": {
      return supersede({
        settleOnAbort: reasonOf,
        wait: ({ rejection }) => {
          throw rejection();
        },
      });
    }
    case "the superseded navigation's own promise": {
      return supersede({
        settleOnAbort: reasonOf,
        wait: ({ first }) => first.then(() => true),
      });
    }
    case "a canDeactivate guard on the request": {
      return supersede({
        settleOnAbort: reasonOf,
        phase: "canDeactivate",
        wait: ({ request }) => request.then(() => true),
      });
    }
  }
}

describe("a guard waiting on another navigation's work fails when that navigation is cancelled", () => {
  it("the cell tables hold each cell once", () => {
    expect(CELLS).toHaveLength(new Set(CELLS).size);
    expect(CONTROLS).toHaveLength(new Set(CONTROLS).size);
    expect(CELLS.length + CONTROLS.length).toBe(11);
  });

  it.each(CELLS)(
    "%s: TRANSITION_ERROR, not TRANSITION_CANCEL",
    async (cell) => {
      const run = await runCell(cell);
      const code =
        cell === "a canDeactivate guard on the request"
          ? errorCodes.CANNOT_DEACTIVATE
          : errorCodes.CANNOT_ACTIVATE;
      const stayedOn =
        cell === "a canDeactivate guard on the request" ? "x" : "home";

      expect(run.first).toBe(errorCodes.TRANSITION_CANCELLED);
      expect(run.second).toBe(code);
      expect(run.log).toStrictEqual([
        "START:p0",
        "CANCEL:p0",
        "START:p",
        `ERROR:p:${code}`,
      ]);
      expect(run.state).toBe(stayedOn);
    },
  );
});

describe("controls — a guard's own cancellation is still a quiet cancel (#933)", () => {
  const quietly = ["START:p0", "CANCEL:p0", "START:p", "CANCEL:p"];

  it.each(CONTROLS)("%s", async (control) => {
    let run: Run;

    switch (control) {
      case "a request of its own, nothing cancels it": {
        run = await supersede({
          settleOnAbort: reasonOf,
          wait: () =>
            new Promise<boolean>((resolve) =>
              setTimeout(() => {
                resolve(true);
              }, 5),
            ),
        });

        expect(run.second).toBe("resolved");
        expect(run.log.at(-1)).toBe("SUCCESS:p");

        return;
      }
      case "the request rejects a plain Error": {
        run = await supersede({
          settleOnAbort: () => new Error("boom"),
          wait: ({ request }) => request.then(() => true),
        });

        expect(run.second).toBe(errorCodes.CANNOT_ACTIVATE);
        expect(run.log.at(-1)).toBe(`ERROR:p:${errorCodes.CANNOT_ACTIVATE}`);

        return;
      }
      case "its own RouterError(TRANSITION_CANCELLED), rejected": {
        run = await supersede({
          settleOnAbort: reasonOf,
          wait: () =>
            Promise.reject(new RouterError(errorCodes.TRANSITION_CANCELLED)),
        });

        break;
      }
      case "its own RouterError(TRANSITION_CANCELLED), thrown": {
        run = await supersede({
          settleOnAbort: reasonOf,
          wait: () => {
            throw new RouterError(errorCodes.TRANSITION_CANCELLED);
          },
        });

        break;
      }
      case "its own AbortError": {
        run = await supersede({
          settleOnAbort: reasonOf,
          wait: () => Promise.reject(new DOMException("aborted", "AbortError")),
        });

        break;
      }
      case "a fresh AbortError from the request (no identity)": {
        run = await supersede({
          settleOnAbort: () => new DOMException("aborted", "AbortError"),
          wait: ({ request }) => request.then(() => true),
        });

        break;
      }
      case "the reason the superseded navigation's caller aborted it with (the caller's own)": {
        run = await supersede({
          settleOnAbort: reasonOf,
          callerAborts: true,
          wait: ({ request }) => request.then(() => true),
        });

        break;
      }
    }

    expect(run.second).toBe(errorCodes.TRANSITION_CANCELLED);
    expect(run.log).toStrictEqual(quietly);
    expect(run.state).toBe("home");
  });

  it("its own navigation's end: a request bound to its own signal, superseded while the guard waits", async () => {
    const router = createRouter([
      { name: "home", path: "/" },
      { name: "q", path: "/q" },
      {
        name: "p",
        path: "/p",
        canActivate: () => (_toState, _fromState, signal) =>
          new Promise<boolean>((_resolve, reject) => {
            signal?.addEventListener(
              "abort",
              () => {
                reject(signal.reason as Error);
              },
              { once: true },
            );
          }),
      },
    ]);
    const log: string[] = [];

    await router.start("/");

    router.usePlugin(() => ({
      onTransitionStart: (toState: State) => log.push(`START:${toState.name}`),
      onTransitionSuccess: (toState: State) =>
        log.push(`SUCCESS:${toState.name}`),
      onTransitionCancel: (toState: State) =>
        log.push(`CANCEL:${toState.name}`),
      onTransitionError: (toState: State | undefined) =>
        log.push(`ERROR:${toState?.name}`),
    }));

    const own = router
      .navigate("p")
      .then(() => "resolved")
      .catch(codeOf);

    await tick();

    const next = await router
      .navigate("q")
      .then(() => "resolved")
      .catch(codeOf);

    await expect(own).resolves.toBe(errorCodes.TRANSITION_CANCELLED);
    expect(next).toBe("resolved");
    expect(log).toStrictEqual(["START:p", "CANCEL:p", "START:q", "SUCCESS:q"]);

    router.dispose();
  });
});

describe("the promise of a navigation that failed on the synchronous arc", () => {
  it("a redirect target's guard waiting on the redirecting navigation's promise fails", async () => {
    let first: Promise<State> | undefined;
    const router = createRouter([
      { name: "home", path: "/" },
      {
        name: "p0",
        path: "/p0",
        canActivate: (r) => () => {
          void r.navigate("p").catch(() => {});

          return false;
        },
      },
      {
        name: "p",
        path: "/p",
        // Asks after a microtask: `first` is assigned once `navigate("p0")`
        // returns, which is after this guard was called.
        canActivate: () => async () => {
          await Promise.resolve();

          return first!.then(() => true);
        },
      },
    ]);
    const log: string[] = [];

    await router.start("/");

    router.usePlugin(() => ({
      onTransitionStart: (toState: State) => log.push(`START:${toState.name}`),
      onTransitionSuccess: (toState: State) =>
        log.push(`SUCCESS:${toState.name}`),
      onTransitionCancel: (toState: State) =>
        log.push(`CANCEL:${toState.name}`),
      onTransitionError: (
        toState: State | undefined,
        _fromState: State | undefined,
        error: unknown,
      ) => log.push(`ERROR:${toState?.name}:${String(codeOf(error))}`),
    }));

    first = router.navigate("p0");

    await expect(first).rejects.toMatchObject({
      code: errorCodes.TRANSITION_CANCELLED,
    });

    await tick();

    expect(log).toStrictEqual([
      "START:p0",
      "CANCEL:p0",
      "START:p",
      `ERROR:p:${errorCodes.CANNOT_ACTIVATE}`,
    ]);
    expect(router.getState()?.name).toBe("home");

    router.dispose();
  });
});

describe("a value the application handed in stays its own, whichever navigation ended with it", () => {
  /** Two navigations to `p`, whose guard `raise` decides; the log of both. */
  async function twice(
    raise: () => boolean | Promise<boolean>,
    before?: (router: Router) => Promise<void>,
  ): Promise<{ codes: unknown[]; log: string[] }> {
    const router = createRouter([
      { name: "home", path: "/" },
      {
        name: "slow",
        path: "/slow",
        canActivate: () => () => new Promise<boolean>(() => {}),
      },
      { name: "p", path: "/p", canActivate: () => raise },
    ]);
    const log: string[] = [];

    await router.start("/");
    await before?.(router);

    router.usePlugin(() => ({
      onTransitionCancel: (toState: State) =>
        log.push(`CANCEL:${toState.name}`),
      onTransitionError: (
        toState: State | undefined,
        _fromState: State | undefined,
        error: unknown,
      ) => log.push(`ERROR:${toState?.name}:${String(codeOf(error))}`),
    }));

    const codes = [
      await router.navigate("p").catch(codeOf),
      await router.navigate("p").catch(codeOf),
    ];

    router.dispose();

    return { codes, log };
  }

  const quietTwice = {
    codes: [errorCodes.TRANSITION_CANCELLED, errorCodes.TRANSITION_CANCELLED],
    log: ["CANCEL:p", "CANCEL:p"],
  };

  it("one RouterError(TRANSITION_CANCELLED) a guard throws on every navigation", async () => {
    const cancel = new RouterError(errorCodes.TRANSITION_CANCELLED);

    await expect(
      twice(() => {
        throw cancel;
      }),
    ).resolves.toStrictEqual(quietTwice);
  });

  it("one RouterError(TRANSITION_CANCELLED) a guard rejects with on every navigation", async () => {
    const cancel = new RouterError(errorCodes.TRANSITION_CANCELLED);

    await expect(twice(() => Promise.reject(cancel))).resolves.toStrictEqual(
      quietTwice,
    );
  });

  it("the reason of a signal the application passed to an earlier navigation", async () => {
    const session = new AbortController();

    await expect(
      twice(
        () => {
          session.signal.throwIfAborted();

          return true;
        },
        async (router) => {
          const slow = router
            .navigate("slow", {}, undefined, { signal: session.signal })
            .catch(codeOf);

          await tick();
          session.abort();

          await expect(slow).resolves.toBe(errorCodes.TRANSITION_CANCELLED);
        },
      ),
    ).resolves.toStrictEqual(quietTwice);
  });
});
