import { beforeAll, describe, expect, it, vi } from "vitest";

import { createRouter, errorCodes, events } from "@real-router/core";
import { getPluginApi, getRoutesApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

import type { Route, Router, State } from "@real-router/core";

/**
 * #2786 — a `getInternals` member that starts a navigation or commits a state
 * refuses from every window of the reentrancy ban as its facade twin does.
 *
 * ⚑ The member set is the LIVE object's, and every function member carries a
 * verdict: one added to the object reds the ratchet until it is classified. A
 * door is proved a door outside every window — it commits — and inside each
 * window it answers what its twin answers there, while the twin is refused.
 *
 * ⚠ One exception, by name: `revalidateToNotFound` and `systemCommit` ask
 * nothing inside `replace()`'s revalidation, because the revalidation calls
 * them itself. The last cell checks that it still does.
 */

const BASE: Route[] = [
  { name: "home", path: "/" },
  { name: "a", path: "/a" },
  { name: "b", path: "/b" },
  {
    name: "slow",
    path: "/slow",
    canActivate: () => () =>
      new Promise<boolean>(() => {
        /* held */
      }),
  },
];

const settle = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0));

const codeOf = (error: unknown): string | undefined =>
  (error as { code?: string } | undefined)?.code;

const stateB = (router: Router): State =>
  getPluginApi(router).makeState("b", {}, {}, "/b");

const started = async (router: Router): Promise<void> => {
  await router.start("/");
};

/**
 * A door, the facade call it answers for — `navigate()` where it has no twin —
 * and the router it moves outside every window.
 */
const DOORS: Record<
  string,
  {
    readonly door: (router: Router) => unknown;
    readonly twin: (router: Router) => unknown;
    readonly quiet: (router: Router) => Promise<void>;
  }
> = {
  navigateToNotFound: {
    door: (router) => getInternals(router).navigateToNotFound("/nowhere"),
    twin: (router) => router.navigateToNotFound("/nowhere"),
    quiet: started,
  },
  navigateToState: {
    door: (router) => getInternals(router).navigateToState(stateB(router)),
    twin: (router) => getPluginApi(router).navigateToState(stateB(router)),
    quiet: started,
  },
  revalidateToNotFound: {
    door: (router) => getInternals(router).revalidateToNotFound("/nowhere"),
    twin: (router) => router.navigate("b"),
    quiet: started,
  },
  start: {
    door: (router) => getInternals(router).start("/b"),
    twin: (router) => router.start("/b"),
    // It boots a stopped router; the others move a started one.
    quiet: async (router) => {
      await started(router);
      router.stop();
    },
  },
  systemCommit: {
    door: (router) =>
      getInternals(router).systemCommit(stateB(router), router.getState(), {}),
    twin: (router) => router.navigate("b"),
    quiet: started,
  },
};

/**
 * The other function members. They read, build, subscribe, report or
 * configure; none of them moves the committed state.
 */
const NOT_DOORS = [
  "addEventListener",
  "buildPathResolved",
  "buildStateResolved",
  "dependenciesGetStore",
  "emitTransitionError",
  "forwardState",
  "getAdoptedOrigins",
  "getCloneState",
  "getDeclaredQueryNames",
  "getMetaForState",
  "getOptions",
  "getRootPath",
  "getStateName",
  "getTree",
  "isDisposed",
  "isTransitioning",
  "makeState",
  "matchPath",
  "port",
  "routeGetStore",
  "setRootPath",
  "subscribeDiagnostic",
];

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
      return returned.then(
        () => "accepted",
        (error: unknown) => `rejected ${codeOf(error)}`,
      );
    }

    return "accepted";
  };
}

/** Runs `fire` once, the first time it is called after `arm()`. */
function trap(fire: () => void): { arm: () => void; hook: () => void } {
  let armed = false;
  let fired = false;

  return {
    arm: () => {
      armed = true;
    },
    hook: () => {
      if (armed && !fired) {
        fired = true;
        fire();
      }
    },
  };
}

/** Builds a router, runs `inside` once inside the window, and lets it settle. */
type Window = (inside: (router: Router) => void) => Promise<void>;

const WINDOWS: Record<string, Window> = {
  "the logger's callback": async (inside) => {
    let router!: Router;
    const { arm, hook } = trap(() => {
      inside(router);
    });

    router = createRouter(BASE, {
      logger: { level: "none", callbackIgnoresLevel: true, callback: hook },
    });
    await router.start("/");
    arm();
    void router.navigate("slow").catch(() => {});
    await router.navigate("a").catch(() => {});
    await settle();
  },

  "a router event listener": async (inside) => {
    const router = createRouter(BASE, { logger: { level: "none" } });
    const { arm, hook } = trap(() => {
      inside(router);
    });

    getPluginApi(router).addEventListener(events.TRANSITION_SUCCESS, hook);
    await router.start("/");
    arm();
    await router.navigate("a").catch(() => {});
    await settle();
  },

  "a $stop listener dispose() runs": async (inside) => {
    const router = createRouter(BASE, { logger: { level: "none" } });
    const { arm, hook } = trap(() => {
      inside(router);
    });

    router.usePlugin(() => ({ onStop: hook }));
    await router.start("/");
    arm();
    router.dispose();
    await settle();
  },

  "a navigation being prepared": async (inside) => {
    let router!: Router;
    const { arm, hook } = trap(() => {
      inside(router);
    });

    router = createRouter(
      [
        ...BASE,
        {
          name: "fwd",
          path: "/fwd",
          forwardTo: () => {
            hook();

            return "a";
          },
        },
      ],
      { logger: { level: "none" } },
    );
    await router.start("/");
    arm();
    await router.navigate("fwd").catch(() => {});
    await settle();
  },

  "a guard navigateToNotFound() consults": async (inside) => {
    let router!: Router;
    const { arm, hook } = trap(() => {
      inside(router);
    });

    router = createRouter(
      [
        ...BASE,
        {
          name: "x",
          path: "/x",
          canDeactivate: () => () => {
            hook();

            return true;
          },
        },
      ],
      { logger: { level: "none" } },
    );
    await router.start("/x");
    arm();

    try {
      router.navigateToNotFound("/nowhere");
    } catch {
      // The door's own outcome is not the question.
    }

    await settle();
  },

  "replace()'s revalidation": async (inside) => {
    const router = createRouter(BASE, { logger: { level: "none" } });
    const { arm, hook } = trap(() => {
      inside(router);
    });

    getRoutesApi(router).subscribeChanges(hook);
    await router.start("/a");
    arm();

    try {
      getRoutesApi(router).replace(BASE);
    } catch {
      // The replace's own outcome is not the question.
    }

    await settle();
  },
};

/** The doors that ask nothing inside a window, by name, with the reason above. */
const EXCEPTIONS = [
  "replace()'s revalidation › revalidateToNotFound",
  "replace()'s revalidation › systemCommit",
];

interface Row {
  readonly at: string;
  readonly door: string;
  readonly twin: string;
}

async function outcomeIn(
  window: Window,
  call: (router: Router) => unknown,
): Promise<string> {
  let pending: (() => Promise<string>) | undefined;

  await window((router) => {
    pending = capture(() => call(router));
  });

  return pending === undefined ? "not reached" : pending();
}

describe("#2786 — a getInternals door refuses from every window as its twin does", () => {
  const rows: Row[] = [];

  beforeAll(async () => {
    for (const [windowName, window] of Object.entries(WINDOWS)) {
      for (const [doorName, { door, twin }] of Object.entries(DOORS)) {
        rows.push({
          at: `${windowName} › ${doorName}`,
          door: await outcomeIn(window, door),
          twin: await outcomeIn(window, twin),
        });
      }
    }
  });

  it("classifies every function member of the live object", () => {
    const live = getInternals(createRouter(BASE)) as unknown as Record<
      string,
      unknown
    >;
    const members = Object.keys(live)
      .filter((key) => typeof live[key] === "function")
      .toSorted((x, y) => x.localeCompare(y));

    expect(members).toStrictEqual(
      [...Object.keys(DOORS), ...NOT_DOORS].toSorted((x, y) =>
        x.localeCompare(y),
      ),
    );
  });

  it.each(Object.keys(DOORS))(
    "%s starts a navigation or commits outside every window",
    async (doorName) => {
      const router = createRouter(BASE, { logger: { level: "none" } });

      await DOORS[doorName].quiet(router);

      const before = router.getState();
      const outcome = await capture(() => DOORS[doorName].door(router))();

      expect(outcome).toBe("accepted");
      expect(router.getState()).not.toBe(before);
    },
  );

  it("every window is reached, and refuses the twin", () => {
    // POSITIVE CONTROL: a window that never ran its callback, or ran it where
    // the facade is admitted, would make the parity below vacuous.
    expect(new Set(rows.map((row) => row.twin))).toStrictEqual(
      new Set([
        `threw ${errorCodes.REENTRANT_NAVIGATION}`,
        `rejected ${errorCodes.ROUTER_ALREADY_STARTED}`,
      ]),
    );

    // `start()` rejects a started router before it asks the ban (#2778), so
    // only the window that stops the router reaches the ban through it.
    expect(
      rows
        .filter((row) => row.twin.startsWith("rejected"))
        .map((row) => row.at),
    ).toStrictEqual(
      Object.keys(WINDOWS)
        .filter((name) => name !== "a $stop listener dispose() runs")
        .map((name) => `${name} › start`),
    );
  });

  it("each door answers what its twin answers, except the named exception", () => {
    expect(
      rows.filter((row) => row.door !== row.twin).map((row) => row.at),
    ).toStrictEqual(EXCEPTIONS);

    for (const row of rows.filter((r) => EXCEPTIONS.includes(r.at))) {
      expect(row.door).toBe("accepted");
      expect(row.twin).toBe(`threw ${errorCodes.REENTRANT_NAVIGATION}`);
    }
  });

  it("the exception still applies: replace()'s revalidation calls both doors itself, from inside a listener too", async () => {
    const router = createRouter(BASE, { logger: { level: "none" } });
    const internals = getInternals(router);
    const revalidate = vi.spyOn(internals, "revalidateToNotFound");
    const commit = vi.spyOn(internals, "systemCommit");
    const replaced: (() => Promise<string>)[] = [];

    await router.start("/");

    getPluginApi(router).addEventListener(events.TRANSITION_SUCCESS, () => {
      if (replaced.length === 0) {
        replaced.push(
          // `a` survives: the revalidation commits it again through
          // `systemCommit`.
          capture(() => {
            getRoutesApi(router).replace(BASE);
          }),
          // `a` is dropped: the revalidation commits the 404 through the other.
          capture(() => {
            getRoutesApi(router).replace(
              BASE.filter((route) => route.name !== "a"),
            );
          }),
        );
      }
    });

    await router.navigate("a");
    await settle();

    await expect(
      Promise.all(replaced.map((outcome) => outcome())),
    ).resolves.toStrictEqual(["accepted", "accepted"]);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(revalidate).toHaveBeenCalledTimes(1);
  });
});
