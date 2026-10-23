import {
  createRouter,
  errorCodes,
  events,
  RouterError,
} from "@real-router/core";
import { getLifecycleApi, getPluginApi } from "@real-router/core/api";
import { afterEach, describe, expect, it } from "vitest";

import { navigationPluginFactory } from "../../src";
import { MockNavigation } from "../helpers/mockNavigation";
import {
  createMockNavigationBrowser,
  routerConfig,
} from "../helpers/testUtils";

import type { Router } from "@real-router/core";

/**
 * #2802 — a navigation the browser starts that a newer router navigation
 * cancels leaves what that navigation's end decides, whenever it ends: one
 * that commits writes after the entry the browser's navigation committed;
 * one that is refused, or cancelled with nothing newer behind it, sends the
 * browser back to the entry the router stands on, as a refused one does
 * (#2740, #2796).
 */

type Ending =
  | "is refused"
  | "cancels quietly"
  | "commits"
  | "gives way to one that is refused"
  | "gives way to one that commits";

const ENDINGS: readonly Ending[] = [
  "is refused",
  "cancels quietly",
  "commits",
  "gives way to one that is refused",
  "gives way to one that commits",
];

// Lets the handler, the router transition and the plugin's own traversal run.
const settle = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) {
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  }
};

let router: Router | undefined;

async function setup(
  maxListeners?: number,
): Promise<{ mock: MockNavigation; router: Router }> {
  const mock = new MockNavigation("http://localhost/home");

  router = createRouter(routerConfig, {
    defaultRoute: "home",
    allowNotFound: true,
    ...(maxListeners !== undefined && { limits: { maxListeners } }),
  });
  router.usePlugin(
    navigationPluginFactory({}, createMockNavigationBrowser(mock)),
  );
  await router.start();

  return { mock, router };
}

const where = (
  mock: MockNavigation,
): {
  entries: string[];
  index: number | undefined;
  route: string | undefined;
} => ({
  entries: mock.entries().map((entry) => new URL(entry.url).pathname),
  index: mock.currentEntry?.index,
  route: router?.getState()?.name,
});

/** How a navigation's `finished` has ended so far, read when called. */
function outcomeOf(result: { finished: Promise<unknown> }): () => string {
  let outcome = "running";

  result.finished.then(
    () => {
      outcome = "finished";
    },
    () => {
      outcome = "rejected";
    },
  );

  return () => outcome;
}

/** Holds the first leave of `users.view`; every later one is allowed. */
function holdTheLeave(r: Router): void {
  let first = true;

  getLifecycleApi(r).addDeactivateGuard("users.view", () => () => {
    if (!first) {
      return true;
    }

    first = false;

    return new Promise<boolean>(() => {});
  });
}

/**
 * Holds the first leave of `users.view` until the returned function cancels it
 * quietly; every later one is allowed.
 */
function cancelTheLeaveQuietly(r: Router): () => void {
  let cancel = (): void => {};
  let first = true;

  getLifecycleApi(r).addDeactivateGuard("users.view", () => () => {
    if (!first) {
      return true;
    }

    first = false;

    return new Promise<boolean>((_resolve, reject) => {
      cancel = () => {
        reject(new RouterError(errorCodes.TRANSITION_CANCELLED));
      };
    });
  });

  return () => {
    cancel();
  };
}

/** The guard of `route`, answered when the returned function is called. */
function gate(
  r: Router,
  route: string,
): (answer: boolean | RouterError) => void {
  let end: ((answer: boolean | RouterError) => void) | undefined;

  getLifecycleApi(r).addActivateGuard(
    route,
    () => () =>
      new Promise<boolean>((resolve, reject) => {
        end = (answer) => {
          if (answer instanceof RouterError) {
            reject(answer);
          } else {
            resolve(answer);
          }
        };
      }),
  );

  return (answer) => end?.(answer);
}

/** Ends the newer navigation; the ones that give way start a third. */
function finish(
  r: Router,
  ending: Ending,
  end: (answer: boolean | RouterError) => void,
): void {
  switch (ending) {
    case "is refused": {
      end(false);

      return;
    }
    case "cancels quietly": {
      end(new RouterError(errorCodes.TRANSITION_CANCELLED));

      return;
    }
    case "commits": {
      end(true);

      return;
    }
    case "gives way to one that is refused": {
      getLifecycleApi(r).addActivateGuard("index", () => () => false);
      void r.navigate("index").catch(() => undefined);

      return;
    }
    case "gives way to one that commits": {
      void r.navigate("index");
    }
  }
}

/** When the newer navigation ends: inside the call that cancels the Back's, or after it settled. */
const TIMINGS = ["at once", "after the Back settled"] as const;

/** The answer of the newer navigation's guard for each of its own endings. */
const ANSWER: Readonly<
  Record<
    "is refused" | "cancels quietly" | "commits",
    () => boolean | RouterError
  >
> = {
  "is refused": () => false,
  "cancels quietly": () => new RouterError(errorCodes.TRANSITION_CANCELLED),
  commits: () => true,
};

/**
 * The guard of `users.list`, which ends the newer navigation as `ending` says:
 * at once, or when the returned function is called.
 */
function endTheNewer(
  r: Router,
  ending: keyof typeof ANSWER,
  timing: (typeof TIMINGS)[number],
): () => void {
  if (timing === "after the Back settled") {
    const end = gate(r, "users.list");

    return () => {
      end(ANSWER[ending]());
    };
  }

  getLifecycleApi(r).addActivateGuard("users.list", () => () => {
    const answer = ANSWER[ending]();

    if (answer instanceof RouterError) {
      throw answer;
    }

    return answer;
  });

  return () => {};
}

/** Holds `index` at its guard until the returned function lets it in. */
function holdTheIndex(r: Router): () => void {
  let letIn = (): void => {};

  getLifecycleApi(r).addActivateGuard(
    "index",
    () => () =>
      new Promise<boolean>((resolve) => {
        letIn = () => {
          resolve(true);
        };
      }),
  );

  return () => {
    letIn();
  };
}

/** The redirect's guard: none, or one the returned function lets it through. */
function guardTheRedirect(
  r: Router,
  redirect: "commits at once" | "commits after its own guard",
): () => void {
  return redirect === "commits at once" ? () => {} : holdTheIndex(r);
}

/** Calls `fn` once `depth` microtasks have run; at 0, at once. */
function afterMicrotasks(depth: number, fn: () => void): void {
  if (depth === 0) {
    fn();

    return;
  }

  let chain = Promise.resolve();

  for (let i = 1; i < depth; i++) {
    chain = chain.then(() => undefined);
  }

  void chain.then(fn);
}

const LATE_ENDS = [
  "a navigation refused at once cancels it",
  "its own signal aborts it",
] as const;

/**
 * Registers a listener of the end `how` names that, once armed, defers a
 * redirect to `index` by a microtask, and returns what arms it and ends the
 * newer navigation that way.
 */
function endLate(
  r: Router,
  how: (typeof LATE_ENDS)[number],
  controller: AbortController,
): () => void {
  let armed = false;
  const redirect = (): void => {
    if (!armed) {
      return;
    }

    armed = false;
    queueMicrotask(() => {
      void r.navigate("index").catch(() => undefined);
    });
  };

  if (how === "its own signal aborts it") {
    getPluginApi(r).addEventListener(events.TRANSITION_CANCEL, redirect);

    return () => {
      armed = true;
      controller.abort();
    };
  }

  getPluginApi(r).addEventListener(events.TRANSITION_ERROR, redirect);
  getLifecycleApi(r).addActivateGuard("users.view", () => () => false);

  return () => {
    armed = true;
    void r.navigate("users.view", { id: "1" }).catch(() => undefined);
  };
}

/**
 * Registers a listener of `event` that, once armed, starts a navigation to
 * `to` in a microtask, and returns what arms it.
 */
function navigateOn(
  r: Router,
  event: "error" | "cancel",
  to: string,
): () => void {
  let armed = false;

  getPluginApi(r).addEventListener(
    event === "error" ? events.TRANSITION_ERROR : events.TRANSITION_CANCEL,
    () => {
      if (!armed) {
        return;
      }

      armed = false;
      queueMicrotask(() => {
        void r.navigate(to).catch(() => undefined);
      });
    },
  );

  return () => {
    armed = true;
  };
}

const RETURNED = {
  entries: ["/home", "/users/view/42"],
  index: 1,
  route: "users.view",
};

const EXPECTED: Readonly<Record<Ending, typeof RETURNED>> = {
  "is refused": RETURNED,
  "cancels quietly": RETURNED,
  commits: { entries: ["/home", "/users/list"], index: 1, route: "users.list" },
  "gives way to one that is refused": RETURNED,
  "gives way to one that commits": {
    entries: ["/home", "/"],
    index: 1,
    route: "index",
  },
};

describe("#2802 — a browser navigation a newer router navigation cancels leaves what that navigation's end decides", () => {
  afterEach(() => {
    router?.stop();
    router = undefined;
  });

  it("the ending table names each expected ending once", () => {
    expect(ENDINGS).toHaveLength(Object.keys(EXPECTED).length);
    expect(new Set(ENDINGS)).toStrictEqual(new Set(Object.keys(EXPECTED)));
  });

  it.each(ENDINGS)(
    "Back: the newer navigation %s after the Back settled",
    async (ending) => {
      const { mock, router: r } = await setup();

      await r.navigate("users.view", { id: "42" });

      const end = gate(r, "users.list");

      holdTheLeave(r);
      mock.back();
      await settle();

      void r.navigate("users.list").catch(() => undefined);
      await settle();
      finish(r, ending, end);
      await settle();

      expect(where(mock)).toStrictEqual(EXPECTED[ending]);
    },
  );

  it.each(
    (["is refused", "cancels quietly"] as const).flatMap((ending) =>
      TIMINGS.map((timing) => [ending, timing] as const),
    ),
  )(
    "Back: the newer navigation %s %s: a redirect its .catch() starts that commits after the Back returned writes after the entry the Back started from",
    async (ending, timing) => {
      const { mock, router: r } = await setup();

      await r.navigate("users.view", { id: "42" });

      const end = endTheNewer(r, ending, timing);
      const letIn = holdTheIndex(r);

      holdTheLeave(r);
      mock.back();
      await settle();

      void r.navigate("users.list").catch(() => {
        void r.navigate("index").catch(() => undefined);
      });
      await settle();
      end();
      await settle();
      letIn();
      await settle();

      expect(where(mock)).toStrictEqual({
        entries: ["/home", "/users/view/42", "/"],
        index: 2,
        route: "index",
      });
    },
  );

  it.each(["commits at once", "commits after its own guard"] as const)(
    "Back: a navigation refused at once that cancels the newer one ends the wait as that one's refusal does: a redirect a TRANSITION_ERROR listener defers by a microtask that %s owns the URL",
    async (redirect) => {
      const { mock, router: r } = await setup();
      let armed = false;

      await r.navigate("users.view", { id: "42" });
      getPluginApi(r).addEventListener(events.TRANSITION_ERROR, () => {
        if (!armed) {
          return;
        }

        armed = false;
        queueMicrotask(() => {
          void r.navigate("index").catch(() => undefined);
        });
      });

      const letIn = guardTheRedirect(r, redirect);

      gate(r, "users.list");
      holdTheLeave(r);
      getLifecycleApi(r).addActivateGuard("users.view", () => () => false);
      mock.back();
      await settle();

      void r.navigate("users.list").catch(() => undefined);
      await settle();
      armed = true;
      void r.navigate("users.view", { id: "1" }).catch(() => undefined);
      await settle();
      letIn();
      await settle();

      expect(where(mock)).toStrictEqual({
        entries: ["/home", "/"],
        index: 1,
        route: "index",
      });
    },
  );

  it.each([
    [
      "is refused at once",
      "users.list",
      { entries: ["/home", "/"], index: 1, route: "index" },
    ],
    [
      "is refused before it starts",
      "nowhere",
      { entries: ["/home", "/users/view/42", "/"], index: 2, route: "index" },
    ],
  ] as const)(
    "Back: after a guard cancels the Back quietly, a navigation a TRANSITION_CANCEL listener starts in a microtask %s: a redirect a listener of that refusal defers lands where the end of a navigation that ran decides",
    async (_how, target, expected) => {
      const { mock, router: r } = await setup();

      await r.navigate("users.view", { id: "42" });

      const start = navigateOn(r, "cancel", target);
      const redirect = navigateOn(r, "error", "index");
      const letIn = holdTheIndex(r);
      const cancel = cancelTheLeaveQuietly(r);

      getLifecycleApi(r).addActivateGuard("users.list", () => () => false);
      mock.back();
      await settle();
      start();
      redirect();
      cancel();
      await settle();
      letIn();
      await settle();

      expect(where(mock)).toStrictEqual(expected);
    },
  );

  it.each(
    LATE_ENDS.flatMap((how) =>
      [0, 1, 2, 3, 4, 5, 6].map((depth) => [how, depth] as const),
    ),
  )(
    "Back: the newer navigation ends when %s %i microtasks after it starts: a redirect a listener of that end defers by a microtask owns the URL",
    async (how, depth) => {
      const { mock, router: r } = await setup();

      await r.navigate("users.view", { id: "42" });

      const controller = new AbortController();
      const end = endLate(r, how, controller);
      const letIn = holdTheIndex(r);

      gate(r, "users.list");
      holdTheLeave(r);
      mock.back();
      await settle();

      void r
        .navigate("users.list", {}, undefined, { signal: controller.signal })
        .catch(() => undefined);
      afterMicrotasks(depth, end);
      await settle();
      letIn();
      await settle();

      expect(where(mock)).toStrictEqual({
        entries: ["/home", "/"],
        index: 1,
        route: "index",
      });
    },
  );

  it("while the newer navigation runs, the Back's navigation waits for it, and one that commits the URL the Back reached lets it finish", async () => {
    const { mock, router: r } = await setup();

    await r.navigate("users.view", { id: "42" });

    const end = gate(r, "home");

    holdTheLeave(r);

    const outcome = outcomeOf(mock.back());

    await settle();

    void r.navigate("home").catch(() => undefined);
    await settle();

    const waiting = outcome();

    end(true);
    await settle();

    expect({ waiting, outcome: outcome(), ...where(mock) }).toStrictEqual({
      waiting: "running",
      outcome: "finished",
      entries: ["/home", "/users/view/42"],
      index: 0,
      route: "home",
    });
  });

  it.each([
    [
      "while the newer navigation runs",
      async (r: Router): Promise<void> => {
        void r.navigate("users.list").catch(() => undefined);
        await settle();
      },
    ],
    ["while a guard holds the Back", async (): Promise<void> => {}],
  ] as const)(
    "stop() %s writes nothing, and the Back's navigation rejects: a stopped router committed nothing",
    async (_when, meanwhile) => {
      const { mock, router: r } = await setup();

      await r.navigate("users.view", { id: "42" });
      gate(r, "users.list");
      holdTheLeave(r);

      const outcome = outcomeOf(mock.back());

      await settle();
      await meanwhile(r);
      r.stop();
      await settle();

      expect({ ...where(mock), back: outcome() }).toStrictEqual({
        entries: ["/home", "/users/view/42"],
        index: 0,
        route: undefined,
        back: "rejected",
      });
    },
  );

  it("stop() after the newer navigation commits the URL the Back reached, before the wait is read, leaves the Back's navigation finished: that one committed", async () => {
    const { mock, router: r } = await setup();

    await r.navigate("users.view", { id: "42" });

    const end = gate(r, "home");

    holdTheLeave(r);

    const outcome = outcomeOf(mock.back());

    await settle();

    const landed = r.navigate("home");

    await settle();
    end(true);
    await landed;
    r.stop();
    await settle();

    expect({ ...where(mock), back: outcome() }).toStrictEqual({
      entries: ["/home", "/users/view/42"],
      index: 0,
      route: undefined,
      back: "finished",
    });
  });

  it.each(
    (["is refused", "commits"] as const).flatMap((ending) =>
      TIMINGS.map((timing) => [ending, timing] as const),
    ),
  )(
    "the watch ends with the newer navigation, which %s %s: it keeps no listener",
    async (ending, timing) => {
      const { mock, router: r } = await setup(3);

      await r.navigate("users.view", { id: "42" });

      const end = endTheNewer(r, ending, timing);

      holdTheLeave(r);
      mock.back();
      await settle();

      void r.navigate("users.list").catch(() => undefined);
      await settle();
      end();
      await settle();

      const api = getPluginApi(r);
      // The plugin's own `onTransitionStart` and `onTransitionSuccess` hold
      // one slot each.
      const free = [
        [events.TRANSITION_START, 2],
        [events.TRANSITION_ERROR, 3],
        [events.TRANSITION_CANCEL, 3],
        [events.TRANSITION_SUCCESS, 2],
      ] as const;

      for (const [event, slots] of free) {
        for (let slot = 0; slot < slots; slot++) {
          expect(() => api.addEventListener(event, () => {})).not.toThrow();
        }
      }
    },
  );

  it("a router whose listener limit refuses the watch leaves the URL to the newer navigation: nothing waits, and nothing is written", async () => {
    // The plugin's own `onTransitionStart` holds the one `$$start` slot.
    const { mock, router: r } = await setup(1);

    await r.navigate("users.view", { id: "42" });

    const end = gate(r, "users.list");

    holdTheLeave(r);

    const outcome = outcomeOf(mock.back());

    await settle();

    const held = outcome();

    void r.navigate("users.list").catch(() => undefined);
    await settle();

    const cancelled = outcome();

    end(false);
    await settle();

    expect({ held, cancelled, ...where(mock) }).toStrictEqual({
      held: "running",
      cancelled: "finished",
      entries: ["/home", "/users/view/42"],
      index: 0,
      route: "users.view",
    });
  });

  // `mock.scrolls` records the scroll the browser applies when a navigation's
  // handlers finish; one a newer navigation aborted gets none (#2751). The
  // newer navigation commits after its own guard.
  interface Via {
    readonly from: (r: Router) => Promise<void>;
    readonly newer: string;
    readonly start: (mock: MockNavigation) => void;
    readonly supersede: (r: Router) => void;
  }

  const BACK: Via = {
    from: async (r: Router): Promise<void> => {
      await r.navigate("users.view", { id: "42" });
    },
    newer: "users.list",
    start: (mock: MockNavigation): void => {
      mock.back();
    },
    supersede: (r: Router): void => {
      void r.navigate("users.list").catch(() => undefined);
    },
  };
  const PUSH: Via = {
    from: async (): Promise<void> => {},
    newer: "users.view",
    start: (mock: MockNavigation): void => {
      mock.navigate("http://localhost/users/list");
    },
    supersede: (r: Router): void => {
      void r.navigate("users.view", { id: "1" }).catch(() => undefined);
    },
  };
  const holdTheList = (r: Router): void => {
    getLifecycleApi(r).addActivateGuard(
      "users.list",
      () => () => new Promise<boolean>(() => {}),
    );
  };
  const nothing: (r: Router) => void = () => {};

  it.each([
    ["a Back a newer commit aborts", BACK, holdTheLeave, BACK.supersede, []],
    ["a push a newer commit aborts", PUSH, holdTheList, PUSH.supersede, []],
    ["CONTROL — a Back that lands", BACK, nothing, nothing, ["/home"]],
    ["CONTROL — a push that lands", PUSH, nothing, nothing, ["/users/list"]],
  ] as const)(
    "the browser's scroll for %s",
    async (_case, via, hold, supersede, scrolls) => {
      const { mock, router: r } = await setup();

      await via.from(r);

      const end = gate(r, via.newer);

      hold(r);

      const before = mock.scrolls.length;

      via.start(mock);
      await settle();
      supersede(r);
      await settle();
      end(true);
      await settle();

      expect(
        mock.scrolls.slice(before).map((url) => new URL(url).pathname),
      ).toStrictEqual(scrolls);
    },
  );

  it("push: a router navigation that supersedes it and is refused after it settled sends the browser back to its origin", async () => {
    const { mock, router: r } = await setup();
    const end = gate(r, "users.view");

    getLifecycleApi(r).addActivateGuard(
      "users.list",
      () => () => new Promise<boolean>(() => {}),
    );
    mock.navigate("http://localhost/users/list");
    await settle();

    void r.navigate("users.view", { id: "1" }).catch(() => undefined);
    await settle();
    end(false);
    await settle();

    expect(where(mock)).toStrictEqual({
      entries: ["/home", "/users/list"],
      index: 0,
      route: "home",
    });
  });
});
