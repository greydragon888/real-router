import { describe, it, expect } from "vitest";

import { constants, createRouter, errorCodes, events } from "@real-router/core";
import { getPluginApi, getRoutesApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

import { captureSyncThrow } from "../../helpers";

import type {
  NavigationOptions,
  Route,
  Router,
  State,
} from "@real-router/core";

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
 * Each describe is one place, the call that reaches it, and a control whose
 * outcome the fix leaves alone.
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

describe("#2786 — navigateToNotFound() consults the departing route inside a window", () => {
  // `navigateToNotFound()` consults the current route's `canDeactivate` (#1643)
  // after it has read `fromState` and before it commits, with no emit on the
  // stack. A navigation a consulted guard starts there either committed and
  // was then overwritten by the 404, announced from a route the router had
  // left, or parked and left the door unable to commit.

  /** A router on `x`, whose `canDeactivate` runs `guard` when `navigateToNotFound()` consults it. */
  async function onX(
    guard: (router: Router, toState: State) => boolean,
  ): Promise<Fixture> {
    let current: Router | undefined;
    const fixture = createFixture([
      ...ROUTES,
      {
        name: "x",
        path: "/x",
        canDeactivate: () => (toState) => guard(current!, toState),
      },
    ]);

    current = fixture.router;
    await fixture.router.start("/x");
    fixture.log.length = 0;

    return fixture;
  }

  it("refuses a navigation a consulted guard starts; the guard's own verdict then decides", async () => {
    let nested: string | undefined;
    let fired = false;
    const { router, log } = await onX((r) => {
      if (!fired) {
        fired = true;
        nested = attempt(() => r.navigate("c"));
      }

      return true;
    });

    const state = router.navigateToNotFound("/nowhere");

    await settle();

    expect(nested).toBe(errorCodes.REENTRANT_NAVIGATION);
    expect(state.name).toBe(constants.UNKNOWN_ROUTE);
    expect(router.getState()?.name).toBe(constants.UNKNOWN_ROUTE);
    expect(log).toStrictEqual([`SUCCESS ${constants.UNKNOWN_ROUTE}<-x`]);
  });

  it("a guard that redirects — navigate(), then return false — is refused at the redirect, and so is the 404", async () => {
    let fired = false;
    const { router, log } = await onX((r, toState) => {
      // Leaving for the redirect is allowed; leaving for the 404 redirects.
      if (toState.name !== constants.UNKNOWN_ROUTE) {
        return true;
      }

      if (!fired) {
        fired = true;
        void r.navigate("c");
      }

      return false;
    });

    const outer = codeOf(
      captureSyncThrow(() => router.navigateToNotFound("/nowhere")),
    );

    await settle();

    expect(outer).toBe(errorCodes.CANNOT_DEACTIVATE);
    expect(router.getState()?.name).toBe("x");
    expect(log).toStrictEqual(["ERROR undefined<-x CANNOT_DEACTIVATE"]);
  });

  it("refuses a navigation onto a route an async guard holds — the 404 still commits", async () => {
    let nested: string | undefined;
    let fired = false;
    const { router, log } = await onX((r) => {
      if (!fired) {
        fired = true;
        nested = attempt(() => r.navigate("slow"));
      }

      return true;
    });

    const state = router.navigateToNotFound("/nowhere");

    await settle();

    expect(nested).toBe(errorCodes.REENTRANT_NAVIGATION);
    expect(state.name).toBe(constants.UNKNOWN_ROUTE);
    expect(log).toStrictEqual([`SUCCESS ${constants.UNKNOWN_ROUTE}<-x`]);
  });

  it("refuses the restart of a guard that stops the router — the 404 then has no router to commit to", async () => {
    let nested: string | undefined;
    let fired = false;
    const { router, log } = await onX((r) => {
      if (!fired) {
        fired = true;
        r.stop();
        nested = attempt(() => r.start("/b"));
      }

      return true;
    });

    const outer = codeOf(
      captureSyncThrow(() => router.navigateToNotFound("/nowhere")),
    );

    await settle();

    expect(nested).toBe(errorCodes.REENTRANT_NAVIGATION);
    expect(outer).toBe(errorCodes.ROUTER_NOT_STARTED);
    expect(router.isActive()).toBe(false);
    expect(log).toStrictEqual(["$stop"]);
  });

  it("control: a guard that refuses keeps the router where it is", async () => {
    const { router, log } = await onX(() => false);

    const outer = codeOf(
      captureSyncThrow(() => router.navigateToNotFound("/nowhere")),
    );

    expect(outer).toBe(errorCodes.CANNOT_DEACTIVATE);
    expect(router.getState()?.name).toBe("x");
    expect(log).toStrictEqual(["ERROR undefined<-x CANNOT_DEACTIVATE"]);

    // The window closes on the refusal's way out as well.
    const next = await router.navigate("a", {}, {}, { forceDeactivate: true });

    expect(next.name).toBe("a");
  });

  it("control: a guard canNavigateTo() consults may still navigate — the predicate has no commit to overwrite it with", async () => {
    let nested: string | undefined;
    let fired = false;
    const { router } = await onX((r) => {
      if (!fired) {
        fired = true;
        nested = attempt(() => r.navigate("c"));
      }

      return true;
    });

    expect(router.canNavigateTo("a")).toBe(true);

    await settle();

    expect(nested).toBe("accepted");
    expect(router.getState()?.name).toBe("c");
  });
});

describe("#2786 — the entry reads the caller's `opts` before `fromState`", () => {
  // `opts` is accessor- or Proxy-backed by contract, so reading it is a call
  // into application code, and no window counts it. A getter that navigated
  // ran after the entry had read `fromState`, so this navigation was announced
  // from the route the nested one had already left. Not a window: the nested
  // navigation stays legal, and the anchor is read after it.

  /** `opts` whose `slot` getter starts `navigate(target)` on its first read. */
  function navigatingOpts(
    router: Router,
    slot: "replace" | "signal",
    target: string,
  ): NavigationOptions {
    const signal = new AbortController().signal;
    const opts = {};
    let fired = false;

    Object.defineProperty(opts, slot, {
      enumerable: true,
      get() {
        if (!fired) {
          fired = true;
          void router.navigate(target).catch(() => {});
        }

        return slot === "signal" && signal;
      },
    });

    return opts;
  }

  /** Named and counted (`table-vacuity-authority`). */
  const GETTER_SLOTS = ["replace", "signal"] as const;

  it("covers both slots the entry reads off the caller", () => {
    expect(GETTER_SLOTS).toHaveLength(2);
  });

  it.each(GETTER_SLOTS)(
    "a navigation an `opts.%s` getter starts commits first, and this one is announced from it",
    async (slot) => {
      const { router, log } = createFixture();

      await router.start("/");
      log.length = 0;

      const state = await router.navigate(
        "a",
        {},
        {},
        navigatingOpts(router, slot, "c"),
      );

      expect(state.name).toBe("a");
      expect(log).toStrictEqual([
        "START c<-home",
        "SUCCESS c<-home",
        "START a<-c",
        "SUCCESS a<-c",
      ]);
    },
  );

  it("a getter that navigates to the same target leaves this one nothing to do", async () => {
    const { router, log } = createFixture();

    await router.start("/");
    log.length = 0;

    const outcome = await router
      .navigate("a", {}, {}, navigatingOpts(router, "replace", "a"))
      .then(
        (state) => state.name,
        (error: unknown) => codeOf(error),
      );

    expect(outcome).toBe(errorCodes.SAME_STATES);
    expect(router.getState()?.name).toBe("a");
    expect(log).toStrictEqual([
      "START a<-home",
      "SUCCESS a<-home",
      `ERROR a<-a ${errorCodes.SAME_STATES}`,
    ]);
  });

  it("control: a getter that throws fails the call before anything is announced", async () => {
    const { router, log } = createFixture();
    const boom = new Error("boom");
    const opts = {};

    Object.defineProperty(opts, "replace", {
      enumerable: true,
      get() {
        throw boom;
      },
    });

    await router.start("/");
    log.length = 0;

    await expect(router.navigate("a", {}, {}, opts)).rejects.toBe(boom);
    expect(router.getState()?.name).toBe("home");
    expect(log).toStrictEqual([]);
  });
});

describe("#2786 — the getInternals doors that start or commit refuse as the facade does", () => {
  // `getInternals` is published, and its members that start a navigation or
  // commit a state reached the machine past the facade's checks. From a
  // `TRANSITION_SUCCESS` listener each committed over the transition being
  // announced, and `start` ran a second boot on a started router.
  // `revalidateToNotFound` and `systemCommit` are the commit doors `replace()`'s
  // own revalidation calls, so inside that window they ask nothing.

  /** Runs `call` now; the returned function says what it did once settled. */
  function capture(call: () => unknown): () => Promise<string> {
    let thrown: unknown;
    let returned: unknown;

    try {
      returned = call();
    } catch (error) {
      thrown = error;
    }

    if (returned instanceof Promise) {
      returned.catch(() => {});
    }

    return async () => {
      if (thrown !== undefined) {
        return `threw ${codeOf(thrown)}`;
      }

      if (returned instanceof Promise) {
        return (returned as Promise<State>).then(
          (state) => `resolved ${state.name}`,
          (error: unknown) => `rejected ${codeOf(error)}`,
        );
      }

      return `returned ${nameOf(returned as State | undefined)}`;
    };
  }

  /** Calls `door` from the first `TRANSITION_SUCCESS` of `navigate("a")`. */
  async function fromListener(
    door: (router: Router) => unknown,
  ): Promise<{ outcome: string | undefined; fixture: Fixture }> {
    const fixture = createFixture();
    const { router, log } = fixture;
    let outcome: (() => Promise<string>) | undefined;

    await router.start("/");
    log.length = 0;

    getPluginApi(router).addEventListener(events.TRANSITION_SUCCESS, () => {
      outcome ??= capture(() => door(router));
    });

    await router.navigate("a");
    await settle();

    return { outcome: await outcome?.(), fixture };
  }

  /** Named and counted (`table-vacuity-authority`). */
  const COMMIT_DOORS: readonly [string, (router: Router) => unknown][] = [
    [
      "navigateToNotFound",
      (router) => getInternals(router).navigateToNotFound("/nowhere"),
    ],
    [
      "revalidateToNotFound",
      (router) => getInternals(router).revalidateToNotFound("/nowhere"),
    ],
    [
      "systemCommit",
      (router) =>
        getInternals(router).systemCommit(
          getPluginApi(router).makeState("b", {}, {}, "/b"),
          router.getState(),
          {},
        ),
    ],
  ];

  /** Named and counted (`table-vacuity-authority`). */
  const REPLACE_ARMS: readonly [
    string,
    (routes: Route[]) => Route[],
    string,
  ][] = [
    [
      "the active route dropped — revalidateToNotFound",
      (routes) => routes.filter((route) => route.name !== "a"),
      constants.UNKNOWN_ROUTE,
    ],
    ["the active route kept — systemCommit", (routes) => routes, "a"],
  ];

  it("covers the three commit doors and both revalidation arms", () => {
    expect(COMMIT_DOORS).toHaveLength(3);
    expect(REPLACE_ARMS).toHaveLength(2);
  });

  it.each(COMMIT_DOORS)(
    "refuses getInternals(router).%s from a listener",
    async (_name, door) => {
      const { outcome, fixture } = await fromListener(door);

      expect(outcome).toBe(`threw ${errorCodes.REENTRANT_NAVIGATION}`);
      expect(fixture.router.getState()?.name).toBe("a");
      expect(fixture.log).toStrictEqual(["START a<-home", "SUCCESS a<-home"]);
    },
  );

  it("getInternals(router).start from a listener rejects as start() does — the router is started", async () => {
    const { outcome, fixture } = await fromListener((router) =>
      getInternals(router).start("/b"),
    );

    expect(outcome).toBe(`rejected ${errorCodes.ROUTER_ALREADY_STARTED}`);
    expect(fixture.router.getState()?.name).toBe("a");
    expect(fixture.log).toStrictEqual(["START a<-home", "SUCCESS a<-home"]);
  });

  it("getInternals(router).start on a started router rejects as start() does", async () => {
    const { router, log } = createFixture();

    await router.start("/");
    log.length = 0;

    const outcome = await capture(() => getInternals(router).start("/b"))();

    expect(outcome).toBe(`rejected ${errorCodes.ROUTER_ALREADY_STARTED}`);
    expect(router.getState()?.name).toBe("home");
    expect(log).toStrictEqual([]);
  });

  it("refuses getInternals(router).start from the $stop listener dispose() runs", async () => {
    const { router, hooks, log } = createFixture();
    let outcome: (() => Promise<string>) | undefined;

    await router.start("/");
    log.length = 0;

    hooks.onStop = () => {
      outcome ??= capture(() => getInternals(router).start("/b"));
    };

    router.dispose();
    await settle();

    await expect(outcome?.()).resolves.toBe(
      `threw ${errorCodes.REENTRANT_NAVIGATION}`,
    );
    expect(log).toStrictEqual(["$stop"]);
  });

  it("getInternals(router).start boots a stopped router, as start() does", async () => {
    const { router, log } = createFixture();

    await router.start("/");
    router.stop();
    log.length = 0;

    const outcome = await capture(() => getInternals(router).start("/b"))();

    expect(outcome).toBe("resolved b");
    expect(log).toStrictEqual([
      "$start",
      "START b<-undefined",
      "SUCCESS b<-undefined",
    ]);
  });

  it.each(REPLACE_ARMS)(
    "control: replace() from a listener still revalidates through its commit door: %s",
    async (_arm, nextRoutes, expected) => {
      const { outcome, fixture } = await fromListener((router) => {
        getRoutesApi(router).replace(nextRoutes(ROUTES));
      });

      expect(outcome).toBe("returned undefined");
      expect(fixture.router.getState()?.name).toBe(expected);
    },
  );
});
