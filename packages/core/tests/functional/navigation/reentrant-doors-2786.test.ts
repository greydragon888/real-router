import { describe, it, expect } from "vitest";

import { createRouter, errorCodes } from "@real-router/core";
import { getPluginApi, getRoutesApi } from "@real-router/core/api";

import { captureSyncThrow } from "../../helpers";

import type { Route, Router, State } from "@real-router/core";

/**
 * #2786 — application code core calls in the middle of its own work, outside
 * every window the reentrancy ban counted.
 *
 * `Router.#assertNotReentrant` refuses a navigation started while core
 * dispatches a router event, prepares a navigation or revalidates the route
 * table. Core called application code in more places than those, and a
 * navigation — or a `stop()` + `start()` — started there ran to completion,
 * after which the operation it was nested in carried on with what it had read
 * before: a `TRANSITION_SUCCESS` from a route the router had already left, a
 * boot committing over the restart, a disposed router left booting.
 *
 * Each describe is one window, with the call that opens it and a control that
 * stays accepted.
 */

const codeOf = (error: unknown): string | undefined =>
  (error as { code?: string } | undefined)?.code;

/** The code of the SYNCHRONOUS throw the ban owes, or `"accepted"`. */
function attempt(call: () => unknown): string | undefined {
  const thrown = captureSyncThrow(() => {
    const result = call();

    // A navigation the ban admits is a promise; its own outcome is not the
    // question here, so it must not surface as an unhandled rejection.
    if (result instanceof Promise) {
      result.catch(() => {});
    }
  });

  return thrown === undefined ? "accepted" : codeOf(thrown);
}

const settle = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0));

const nameOf = (state: State | undefined): string =>
  state === undefined ? "undefined" : state.name;

interface Hooks {
  /** The logger's callback. */
  onLog?: (context: string, message: string) => void;
  onStop?: () => void;
}

interface Fixture {
  readonly router: Router;
  readonly hooks: Hooks;
  readonly log: string[];
}

const ROUTES: Route[] = [
  { name: "home", path: "/" },
  { name: "a", path: "/a" },
  { name: "b", path: "/b" },
  { name: "c", path: "/c" },
  {
    name: "slow",
    path: "/slow",
    canActivate: () => () =>
      new Promise<boolean>(() => {
        /* held */
      }),
  },
];

function createFixture(routes: Route[] = ROUTES): Fixture {
  const hooks: Hooks = {};
  const log: string[] = [];

  const router = createRouter(routes, {
    logger: {
      level: "none",
      callbackIgnoresLevel: true,
      callback: (_level, context, message) => {
        hooks.onLog?.(context, message);
      },
    },
  });

  router.usePlugin(() => ({
    onStart: () => {
      log.push("$start");
    },
    onStop: () => {
      log.push("$stop");
      hooks.onStop?.();
    },
    onTransitionStart: (toState, fromState) => {
      log.push(`START ${toState.name}<-${nameOf(fromState)}`);
    },
    onTransitionSuccess: (toState, fromState) => {
      log.push(`SUCCESS ${toState.name}<-${nameOf(fromState)}`);
    },
    onTransitionError: (toState, fromState, error) => {
      log.push(`ERROR ${nameOf(toState)}<-${nameOf(fromState)} ${error.code}`);
    },
    onTransitionCancel: (toState) => {
      log.push(`CANCEL ${toState.name}`);
    },
  }));

  return { router, hooks, log };
}

/** Runs `inside` from the logger's callback the first time `matches` holds. */
function once(
  hooks: Hooks,
  matches: (context: string, message: string) => boolean,
  inside: () => void,
): void {
  let fired = false;

  hooks.onLog = (context, message) => {
    if (!fired && matches(context, message)) {
      fired = true;
      inside();
    }
  };
}

describe("#2786 — the logger's callback is a window of its own", () => {
  // Core logs from inside its own operations — the supersede warning of a
  // navigation that has already captured its `fromState`, a consulted guard's
  // throw, `replace()` registering a batch, a listener's error — and the
  // callback is the application's. One place calls it, so one predicate holds
  // every logging site at once.

  it("refuses a navigation from the warning a superseding navigate() logs", async () => {
    const { router, hooks, log } = createFixture();
    let nested: string | undefined;

    await router.start("/");
    void router.navigate("slow").catch(() => {});
    await settle();
    once(
      hooks,
      (_context, message) => message.includes("Concurrent navigation"),
      () => {
        nested = attempt(() => router.navigate("c"));
      },
    );
    log.length = 0;

    const state = await router.navigate("a");

    expect(nested).toBe(errorCodes.REENTRANT_NAVIGATION);
    expect(state.name).toBe("a");
    expect(router.getState()?.name).toBe("a");
    expect(log).toStrictEqual([
      "CANCEL slow",
      "START a<-home",
      "SUCCESS a<-home",
    ]);
  });

  it("refuses a restart from that warning — the superseding navigation does not commit over a boot", async () => {
    const { router, hooks, log } = createFixture();
    let nested: string | undefined;

    await router.start("/");
    void router.navigate("slow").catch(() => {});
    await settle();
    once(
      hooks,
      (_context, message) => message.includes("Concurrent navigation"),
      () => {
        router.stop();
        nested = attempt(() => router.start("/b"));
      },
    );
    log.length = 0;

    const outcome = await router.navigate("a").then(
      (state) => state.name,
      (error: unknown) => codeOf(error),
    );

    // The `stop()` stands: the router stays stopped, as the application asked.
    expect(nested).toBe(errorCodes.REENTRANT_NAVIGATION);
    expect(outcome).toBe(errorCodes.TRANSITION_CANCELLED);
    expect(router.isActive()).toBe(false);
    expect(log).toStrictEqual(["CANCEL slow", "$stop"]);
  });

  it("refuses a navigation from the warning a consulted guard's throw logs (navigateToNotFound)", async () => {
    let thrown = false;
    const { router, hooks, log } = createFixture([
      ...ROUTES,
      {
        name: "x",
        path: "/x",
        canDeactivate: () => () => {
          if (!thrown) {
            thrown = true;

            throw new Error("boom");
          }

          return true;
        },
      },
    ]);
    let nested: string | undefined;

    await router.start("/x");
    once(
      hooks,
      (context, message) =>
        context === "router.navigateToNotFound" && message.includes("threw"),
      () => {
        nested = attempt(() => router.navigate("c"));
      },
    );
    log.length = 0;

    const outer = codeOf(
      captureSyncThrow(() => router.navigateToNotFound("/nowhere")),
    );

    expect(nested).toBe(errorCodes.REENTRANT_NAVIGATION);
    expect(outer).toBe(errorCodes.CANNOT_DEACTIVATE);
    expect(router.getState()?.name).toBe("x");
    expect(log).toStrictEqual(["ERROR undefined<-x CANNOT_DEACTIVATE"]);
  });

  it("refuses a navigation from a warning replace() logs before its revalidation window", async () => {
    const { router, hooks, log } = createFixture();
    let nested: string | undefined;

    await router.start("/");
    once(
      hooks,
      (_context, message) =>
        message.includes("has both forwardTo and canActivate"),
      () => {
        nested = attempt(() => router.navigate("c"));
      },
    );
    log.length = 0;

    getRoutesApi(router).replace([
      ...ROUTES,
      {
        name: "fx",
        path: "/fx",
        forwardTo: "a",
        canActivate: () => () => true,
      },
    ]);
    await settle();

    expect(nested).toBe(errorCodes.REENTRANT_NAVIGATION);
    expect(router.getState()?.name).toBe("home");
    expect(log).not.toContain("SUCCESS c<-home");
  });

  it("refuses a restart from the error a throwing $stop listener logs during dispose()", async () => {
    const { router, hooks, log } = createFixture();
    let nested: string | undefined;

    await router.start("/");
    hooks.onStop = () => {
      throw new Error("teardown failed");
    };
    once(
      hooks,
      (_context, message) => message.includes("Error in listener"),
      () => {
        nested = attempt(() => router.start("/b"));
      },
    );
    log.length = 0;

    router.dispose();
    await settle();

    expect(nested).toBe(errorCodes.REENTRANT_NAVIGATION);
    expect(log).toStrictEqual(["$stop"]);
  });

  it("refuses a restart from what a start interceptor logs through PluginApi.logger", async () => {
    const { router, hooks, log } = createFixture();
    let nested: string | undefined;

    getPluginApi(router).addInterceptor("start", (next, path) => {
      getPluginApi(router).logger.warn("router.start", "booting");

      return next(path);
    });
    once(
      hooks,
      (_context, message) => message === "booting",
      () => {
        router.stop();
        nested = attempt(() => router.start("/b"));
      },
    );

    const outcome = await router.start("/").then(
      (state) => state.name,
      (error: unknown) => codeOf(error),
    );

    expect(nested).toBe(errorCodes.REENTRANT_NAVIGATION);
    expect(outcome).toBe(errorCodes.TRANSITION_CANCELLED);
    expect(router.isActive()).toBe(false);
    expect(log).toStrictEqual([]);
  });

  it("refuses even where nothing is in flight — the ban asks whether the callback is on the stack, not why it was called", async () => {
    let thrown = false;
    const { router, hooks } = createFixture([
      ...ROUTES,
      {
        name: "g",
        path: "/g",
        canActivate: () => () => {
          if (!thrown) {
            thrown = true;

            throw new Error("boom");
          }

          return true;
        },
      },
    ]);
    let nested: string | undefined;

    await router.start("/");
    once(
      hooks,
      (context) => context === "router.canNavigateTo",
      () => {
        nested = attempt(() => router.navigate("c"));
      },
    );

    expect(router.canNavigateTo("g")).toBe(false);
    expect(nested).toBe(errorCodes.REENTRANT_NAVIGATION);
  });

  it("control: a navigation the callback DEFERS runs after it", async () => {
    const { router, hooks, log } = createFixture();
    let deferred: Promise<State> | undefined;

    await router.start("/");
    void router.navigate("slow").catch(() => {});
    await settle();
    once(
      hooks,
      (_context, message) => message.includes("Concurrent navigation"),
      () => {
        queueMicrotask(() => {
          deferred = router.navigate("c");
        });
      },
    );
    log.length = 0;

    await router.navigate("a");
    const state = await deferred;

    expect(state?.name).toBe("c");
    expect(log).toStrictEqual([
      "CANCEL slow",
      "START a<-home",
      "SUCCESS a<-home",
      "START c<-a",
      "SUCCESS c<-a",
    ]);
  });

  it("control: the callback may navigate ANOTHER router — the window belongs to the router that logs", async () => {
    const { router, hooks } = createFixture();
    const other = createRouter(ROUTES);
    let nested: string | undefined;

    await router.start("/");
    await other.start("/");
    void router.navigate("slow").catch(() => {});
    await settle();
    once(
      hooks,
      (_context, message) => message.includes("Concurrent navigation"),
      () => {
        nested = attempt(() => other.navigate("c"));
      },
    );

    await router.navigate("a");
    await settle();

    expect(nested).toBe("accepted");
    expect(other.getState()?.name).toBe("c");

    other.dispose();
  });
});

describe("#2786 — dispose() stops the router inside the dispatch", () => {
  // `dispose()` sends STOP on its way to DISPOSE, so its `$stop` listeners run
  // with the teardown still to come. A top-level `stop()` keeps its `$stop`
  // open: a restart from there is supported, and stays the control.

  it("refuses a restart from a $stop listener of dispose()", async () => {
    const { router, hooks, log } = createFixture();
    let nested: string | undefined;

    await router.start("/");
    hooks.onStop = () => {
      nested = attempt(() => router.start("/b"));
    };
    log.length = 0;

    router.dispose();
    await settle();

    expect(nested).toBe(errorCodes.REENTRANT_NAVIGATION);
    expect(router.isActive()).toBe(false);
    expect(log).toStrictEqual(["$stop"]);
  });

  it("refuses a restart onto a route an async guard holds — no start() is left pending on a disposed router", async () => {
    const { router, hooks, log } = createFixture();
    let nested: string | undefined;

    await router.start("/");
    hooks.onStop = () => {
      nested = attempt(() => router.start("/slow"));
    };
    log.length = 0;

    router.dispose();
    await settle();

    expect(nested).toBe(errorCodes.REENTRANT_NAVIGATION);
    expect(log).toStrictEqual(["$stop"]);
  });

  it("control: a $stop listener of a top-level stop() still restarts the router", async () => {
    const { router, hooks, log } = createFixture();
    let nested: string | undefined;

    await router.start("/");
    hooks.onStop = () => {
      nested ??= attempt(() => router.start("/b"));
    };
    log.length = 0;

    router.stop();
    await settle();

    expect(nested).toBe("accepted");
    expect(router.getState()?.name).toBe("b");
    expect(log).toStrictEqual([
      "$stop",
      "$start",
      "START b<-undefined",
      "SUCCESS b<-undefined",
    ]);
  });

  it("control: dispose() from top-level code still cancels a start() an async guard holds", async () => {
    const { router, log } = createFixture();

    const pending = router.start("/slow").then(
      (state) => state.name,
      (error: unknown) => codeOf(error),
    );

    await settle();
    router.dispose();

    await expect(pending).resolves.toBe(errorCodes.TRANSITION_CANCELLED);
    expect(log).toStrictEqual([
      "$start",
      "START slow<-undefined",
      "CANCEL slow",
      "$stop",
    ]);
  });
});
