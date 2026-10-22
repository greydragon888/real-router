import {
  constants,
  createRouter,
  errorCodes,
  events,
  RouterError,
} from "@real-router/core";
import { getLifecycleApi, getPluginApi } from "@real-router/core/api";
import { afterEach, describe, expect, it, vi } from "vitest";

import { memoryPluginFactory } from "@real-router/memory-plugin";

import type { Router, State } from "@real-router/core";

/**
 * #2802 — a restore a newer navigation cancels leaves the stack to that
 * navigation's end, whenever it ends: one that commits applies to the entry
 * the restore moves to (#1234), and one that is refused, or cancelled with
 * nothing newer behind it, leaves the stack on the entry the router shows.
 *
 * The stack is `home`, `about`, `users`; `back()` moves to `about`, whose guard
 * holds it, and `navigate("settings")` supersedes it.
 */

type MemoryRouter = Router & {
  back: () => void;
  canGoBack: () => boolean;
  canGoForward: () => boolean;
};

type Ending =
  | "commits at once"
  | "commits after its own guard"
  | "is refused by its own guard"
  | "cancels quietly"
  | "gives way to one that commits";

const ENDINGS: readonly Ending[] = [
  "commits at once",
  "commits after its own guard",
  "is refused by its own guard",
  "cancels quietly",
  "gives way to one that commits",
];

const ticks = async (): Promise<void> => {
  for (let i = 0; i < 4; i++) {
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  }
};

let router: MemoryRouter | undefined;
// Unsubscribes the plugin `make` installed last.
let removeThePlugin: (() => void) | undefined;

async function make(
  beforeThePlugin: (created: MemoryRouter) => void = () => {},
  maxListeners?: number,
): Promise<MemoryRouter> {
  const created = createRouter(
    [
      { name: "home", path: "/" },
      { name: "about", path: "/about" },
      { name: "users", path: "/users" },
      { name: "settings", path: "/settings" },
      { name: "profile", path: "/profile" },
      { name: "login", path: "/login" },
    ],
    maxListeners === undefined ? {} : { limits: { maxListeners } },
  ) as MemoryRouter;

  beforeThePlugin(created);
  removeThePlugin = created.usePlugin(memoryPluginFactory());
  await created.start("/");
  router = created;
  await created.navigate("about");
  await created.navigate("users");

  return created;
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

/** Holds the first arrival at `about`; every later one is allowed. */
function holdTheRestore(r: Router): void {
  let first = true;

  getLifecycleApi(r).addActivateGuard("about", () => () => {
    if (!first) {
      return true;
    }

    first = false;

    return new Promise<boolean>(() => {});
  });
}

/** Holds the first arrival at `route` until it is answered; every later one is allowed. */
function holdFirst(r: Router, route: string): (answer: boolean) => void {
  let answer: ((value: boolean) => void) | undefined;
  let first = true;

  getLifecycleApi(r).addActivateGuard(route, () => () => {
    if (!first) {
      return true;
    }

    first = false;

    return new Promise<boolean>((resolve) => {
      answer = resolve;
    });
  });

  return (value) => answer?.(value);
}

/** Where the router ends, the index it published, and the Backs from there. */
async function walk(r: MemoryRouter): Promise<{
  end: string;
  back: string[];
}> {
  const memory = (
    r.getState()?.context as State["context"] & {
      memory?: { historyIndex: number };
    }
  ).memory;
  const end = `${r.getState()?.name}/${memory?.historyIndex}`;
  const back: string[] = [];

  while (r.canGoBack()) {
    r.back();
    await ticks();
    back.push(r.getState()?.name ?? "?");
  }

  return { end, back };
}

const STAYED = { end: "users/2", back: ["about", "home"] };

const EXPECTED: Readonly<Record<Ending, typeof STAYED>> = {
  "commits at once": { end: "settings/2", back: ["about", "home"] },
  "commits after its own guard": { end: "settings/2", back: ["about", "home"] },
  "is refused by its own guard": STAYED,
  "cancels quietly": STAYED,
  "gives way to one that commits": {
    end: "profile/2",
    back: ["about", "home"],
  },
};

const REFUSED = ["the newer navigation", "the restore"] as const;
const REDIRECTS = [
  "commits at once",
  "commits after its own guard",
  "starts a task later",
] as const;
const ORDERS = ["before", "after"] as const;

type Redirect = (typeof REDIRECTS)[number];

const PAST_THE_TARGET = { end: "login/2", back: ["about", "home"] };
const PAST_THE_SHOWN = { end: "login/3", back: ["users", "about", "home"] };

/**
 * Where a redirect a `TRANSITION_ERROR` listener defers lands. One the newer
 * navigation's refusal starts within the microtasks of its end is newer still
 * and decides at its own end (#2802). A restore the router refused stops
 * moving the stack whatever runs then, so only a commit by then lands past
 * its target, as a refused traversal returns unless a navigation committed
 * meanwhile (#2740).
 */
const LANDS: Readonly<
  Record<
    (typeof REFUSED)[number],
    Readonly<Record<Redirect, typeof PAST_THE_TARGET>>
  >
> = {
  "the newer navigation": {
    "commits at once": PAST_THE_TARGET,
    "commits after its own guard": PAST_THE_TARGET,
    "starts a task later": PAST_THE_SHOWN,
  },
  "the restore": {
    "commits at once": PAST_THE_TARGET,
    "commits after its own guard": PAST_THE_SHOWN,
    "starts a task later": PAST_THE_SHOWN,
  },
};

const REDIRECT_CASES = REFUSED.flatMap((refused) =>
  REDIRECTS.flatMap((redirect) =>
    ORDERS.map((order) => [refused, redirect, order] as const),
  ),
);

/**
 * A `TRANSITION_ERROR` or `TRANSITION_CANCEL` listener that, once armed,
 * defers a navigation to `to` — a redirect to `login` unless named.
 */
function redirectOnEnd(
  r: Router,
  end: "error" | "cancel",
  redirect: Redirect,
  to = "login",
): { arm: () => void } {
  let armed = false;
  const listener = (): void => {
    if (!armed) {
      return;
    }

    armed = false;

    const go = (): void => {
      void r.navigate(to).catch(() => undefined);
    };

    if (redirect === "starts a task later") {
      setTimeout(go, 0);
    } else {
      queueMicrotask(go);
    }
  };

  if (end === "error") {
    getPluginApi(r).addEventListener(events.TRANSITION_ERROR, listener);
  } else {
    getPluginApi(r).addEventListener(events.TRANSITION_CANCEL, listener);
  }

  return {
    arm: () => {
      armed = true;
    },
  };
}

/** Navigates to `login` now, or a task later for a redirect that starts then. */
function startLogin(r: Router, redirect: Redirect): void {
  const go = (): void => {
    void r.navigate("login").catch(() => undefined);
  };

  if (redirect === "starts a task later") {
    setTimeout(go, 0);
  } else {
    go();
  }
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

/**
 * Registers on `created` a `TRANSITION_START` listener that, once armed,
 * aborts `controller` when a navigation to `route` is announced.
 */
function abortOnStart(
  created: Router,
  route: string,
  controller: AbortController,
): () => void {
  let armed = false;

  getPluginApi(created).addEventListener(
    events.TRANSITION_START,
    (toState: State) => {
      if (armed && toState.name === route) {
        armed = false;
        controller.abort();
      }
    },
  );

  return () => {
    armed = true;
  };
}

const LATE_ENDS = [
  "a navigation refused at once cancels it",
  "its own signal aborts it",
] as const;

/**
 * Registers on `created` a listener of the end `how` names that, once armed,
 * defers a redirect to `login` by a microtask, and returns what arms it and
 * ends the newer navigation that way.
 */
function endLate(
  created: Router,
  how: (typeof LATE_ENDS)[number],
  controller: AbortController,
): () => void {
  if (how === "its own signal aborts it") {
    const listener = redirectOnEnd(created, "cancel", "commits at once");

    return () => {
      listener.arm();
      controller.abort();
    };
  }

  const listener = redirectOnEnd(created, "error", "commits at once");

  return () => {
    listener.arm();
    void created.navigate("profile").catch(() => undefined);
  };
}

/** A `TRANSITION_ERROR` listener that, once armed, defers a `back()`. */
function backOnError(r: MemoryRouter): () => void {
  let armed = false;

  getPluginApi(r).addEventListener(events.TRANSITION_ERROR, () => {
    if (!armed) {
      return;
    }

    armed = false;
    queueMicrotask(() => {
      r.back();
    });
  });

  return () => {
    armed = true;
  };
}

/** For a redirect that commits after its own guard: lets `login` in a task after its guard is asked. */
function guardLogin(r: Router, redirect: Redirect): void {
  if (redirect !== "commits after its own guard") {
    return;
  }

  getLifecycleApi(r).addActivateGuard(
    "login",
    () => () =>
      new Promise<boolean>((resolve) => {
        setTimeout(() => {
          resolve(true);
        }, 0);
      }),
  );
}

/**
 * Refuses the held restore, or a newer navigation to `settings` that cancels
 * it, once `listener` is armed.
 */
async function refuse(
  r: Router,
  refused: (typeof REFUSED)[number],
  listener: { arm: () => void },
  answerTheRestore: (answer: boolean) => void,
): Promise<void> {
  if (refused === "the restore") {
    listener.arm();
    answerTheRestore(false);

    return;
  }

  const end = gate(r, "settings");

  void r.navigate("settings").catch(() => undefined);
  await ticks();
  listener.arm();
  end(false);
}

type NewerEnding = "is refused by its own guard" | "cancels quietly";

/** The answer of the newer navigation's guard for each of its endings. */
const ANSWER: Readonly<Record<NewerEnding, () => boolean | RouterError>> = {
  "is refused by its own guard": () => false,
  "cancels quietly": () => new RouterError(errorCodes.TRANSITION_CANCELLED),
};

const NEWER_ENDINGS = [
  "is refused by its own guard",
  "cancels quietly",
] as const;

/** When the newer navigation ends: before or after the restore's rejection is handled. */
const TIMINGS = [
  "inside the call that cancels the restore",
  "after the restore's rejection",
] as const;

type Timing = (typeof TIMINGS)[number];

const NEWER_CASES = NEWER_ENDINGS.flatMap((ending) =>
  TIMINGS.map((timing) => [ending, timing] as const),
);

/**
 * The guard of `settings`, which ends the newer navigation as `ending` says:
 * at once, or when the returned function is called.
 */
function guardSettings(
  r: Router,
  ending: NewerEnding,
  timing: Timing,
): () => void {
  if (timing === "after the restore's rejection") {
    const end = gate(r, "settings");

    return () => {
      end(ANSWER[ending]());
    };
  }

  getLifecycleApi(r).addActivateGuard("settings", () => () => {
    const answer = ANSWER[ending]();

    if (answer instanceof RouterError) {
      throw answer;
    }

    return answer;
  });

  return () => {};
}

/** Navigates to `settings`, calling `rejected` from the rejection handler. */
const HANDLERS = {
  ".catch()": (r: Router, rejected: () => void): void => {
    void r.navigate("settings").catch(rejected);
  },
  "a try around await": (r: Router, rejected: () => void): void => {
    void (async () => {
      try {
        await r.navigate("settings");
      } catch {
        rejected();
      }
    })();
  },
};

const TRANSITION_EVENTS = [
  events.TRANSITION_START,
  events.TRANSITION_SUCCESS,
  events.TRANSITION_ERROR,
  events.TRANSITION_CANCEL,
] as const;

/** How many more listeners the router takes on each transition event, up to `most`. */
function room(r: Router, most: number): number[] {
  const api = getPluginApi(r);

  return TRANSITION_EVENTS.map((event) => {
    const removers: (() => void)[] = [];

    try {
      while (removers.length < most) {
        removers.push(api.addEventListener(event, () => {}));
      }
    } catch {
      // The router's listener limit.
    }

    for (const remove of removers) {
      remove();
    }

    return removers.length;
  });
}

/** Ends the newer navigation, held by `end`; the one that gives way starts a third. */
function endTheNewer(
  r: Router,
  ending: Exclude<Ending, "commits at once">,
  end: (answer: boolean | RouterError) => void,
): void {
  switch (ending) {
    case "commits after its own guard": {
      end(true);

      return;
    }
    case "is refused by its own guard": {
      end(false);

      return;
    }
    case "cancels quietly": {
      end(new RouterError(errorCodes.TRANSITION_CANCELLED));

      return;
    }
    case "gives way to one that commits": {
      void r.navigate("profile");
    }
  }
}

/** Where a redirect a `TRANSITION_CANCEL` listener defers after a guard cancels the restore quietly lands. */
const CANCEL_LANDS: Readonly<Record<Redirect, typeof PAST_THE_TARGET>> = {
  "commits at once": PAST_THE_TARGET,
  "commits after its own guard": PAST_THE_TARGET,
  "starts a task later": PAST_THE_SHOWN,
};

describe("#2802 — a restore a newer navigation cancels leaves the stack to that navigation's end", () => {
  afterEach(() => {
    router?.stop();
    router = undefined;
  });

  it("the ending table names each expected ending once", () => {
    expect(ENDINGS).toHaveLength(Object.keys(EXPECTED).length);
    expect(new Set(ENDINGS)).toStrictEqual(new Set(Object.keys(EXPECTED)));
  });

  it.each(ENDINGS)("the newer navigation %s", async (ending) => {
    const r = await make();
    const end = ending === "commits at once" ? undefined : gate(r, "settings");

    holdTheRestore(r);
    r.back();
    void r.navigate("settings").catch(() => undefined);
    // The restore's rejection is handled before the newer navigation ends.
    await ticks();

    switch (ending) {
      case "commits at once": {
        break;
      }
      case "commits after its own guard": {
        end?.(true);

        break;
      }
      case "is refused by its own guard": {
        end?.(false);

        break;
      }
      case "cancels quietly": {
        end?.(new RouterError(errorCodes.TRANSITION_CANCELLED));

        break;
      }
      case "gives way to one that commits": {
        void r.navigate("profile");
      }
    }

    await ticks();

    await expect(walk(r)).resolves.toStrictEqual(EXPECTED[ending]);
  });

  it("the newer navigation replaces after its own guard: it overwrites the entry the restore moves to", async () => {
    const r = await make();
    const end = gate(r, "settings");

    holdTheRestore(r);
    r.back();
    void r
      .navigate("settings", {}, undefined, { replace: true })
      .catch(() => undefined);
    await ticks();
    end(true);
    await ticks();

    await expect(walk(r)).resolves.toStrictEqual({
      end: "settings/1",
      back: ["home"],
    });
  });

  it("while the newer navigation runs, the stack stands on the entry the restore moves to", async () => {
    const r = await make();

    gate(r, "settings");
    holdTheRestore(r);
    r.back();
    void r.navigate("settings").catch(() => undefined);
    await ticks();

    expect({
      canGoBack: r.canGoBack(),
      canGoForward: r.canGoForward(),
    }).toStrictEqual({ canGoBack: true, canGoForward: true });
  });

  it("a back() while the newer navigation runs moves from the entry the first restore moves to", async () => {
    const r = await make();

    gate(r, "settings");
    holdTheRestore(r);
    r.back();
    void r.navigate("settings").catch(() => undefined);
    await ticks();
    r.back();
    await ticks();

    await expect(walk(r)).resolves.toStrictEqual({ end: "home/0", back: [] });
  });

  it("a navigation refused before it starts while the newer one runs decides nothing, and the plugin's hooks throw nothing", async () => {
    const r = await make();
    const end = gate(r, "settings");
    // Core logs a hook that throws rather than failing the navigation.
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});

    holdTheRestore(r);
    r.back();
    void r.navigate("settings").catch(() => undefined);
    await ticks();
    // Refused against the committed state, with the newer one still running:
    // one error carries no state, the other a state of its own.
    await r.navigate("nowhere").catch(() => undefined);
    await r.navigate("users").catch(() => undefined);
    end(true);
    await ticks();

    const logged = [...errors.mock.calls];

    errors.mockRestore();

    expect(logged).toStrictEqual([]);
    await expect(walk(r)).resolves.toStrictEqual(
      EXPECTED["commits after its own guard"],
    );
  });

  it("a restore a listener ends inside its announce moves no position", async () => {
    const created = createRouter([
      { name: "home", path: "/" },
      { name: "about", path: "/about" },
      { name: "users", path: "/users" },
      { name: "settings", path: "/settings" },
    ]) as MemoryRouter;
    let stopOn: string | undefined;

    // Called before the plugin's: the cancel reaches it before the announce.
    created.usePlugin(() => ({
      onTransitionStart: (toState) => {
        if (toState.name === stopOn) {
          stopOn = undefined;
          created.stop();
        }
      },
    }));
    created.usePlugin(memoryPluginFactory());
    await created.start("/");
    router = created;
    await created.navigate("about");
    await created.navigate("users");
    stopOn = "about";
    created.back();
    await ticks();
    await created.start("/settings");

    await expect(walk(created)).resolves.toStrictEqual({
      end: "settings/0",
      back: [],
    });
  });

  it.each([
    [0, "past the restore's target", PAST_THE_TARGET],
    [1, "past the restore's target", PAST_THE_TARGET],
    [2, "past the restore's target", PAST_THE_TARGET],
    [3, "past the entry the router shows", PAST_THE_SHOWN],
  ] as const)(
    "the navigation that cancels the restore ends inside its announce, by a listener the router calls before the plugin's: it ends nothing the restore waits for, and a redirect started %i microtasks after it lands %s",
    async (depth, _where, expected) => {
      const controller = new AbortController();
      let arm: (() => void) | undefined;
      const r = await make((created) => {
        arm = abortOnStart(created, "settings", controller);
      });

      holdTheRestore(r);
      r.back();
      await ticks();
      arm?.();
      void r
        .navigate("settings", {}, undefined, { signal: controller.signal })
        .catch(() => undefined);
      afterMicrotasks(depth, () => {
        void r.navigate("login").catch(() => undefined);
      });
      await ticks();

      await expect(walk(r)).resolves.toStrictEqual(expected);
    },
  );

  it.each(REDIRECT_CASES)(
    "after %s is refused, a redirect a listener defers that %s lands where it does whether the listener is registered %s the plugin",
    async (refused, redirect, order) => {
      let listener: { arm: () => void } | undefined;
      const r = await make((created) => {
        if (order === "before") {
          listener = redirectOnEnd(created, "error", redirect);
        }
      });

      listener ??= redirectOnEnd(r, "error", redirect);
      guardLogin(r, redirect);

      const answerTheRestore = holdFirst(r, "about");

      r.back();
      await ticks();
      await refuse(r, refused, listener, answerTheRestore);
      await ticks();
      await ticks();

      await expect(walk(r)).resolves.toStrictEqual(LANDS[refused][redirect]);
    },
  );

  it.each(REDIRECTS)(
    "a redirect a TRANSITION_ERROR listener registered after the restore's cancel defers lands past the entry the router shows after the newer navigation is refused: it %s",
    async (redirect) => {
      const r = await make();
      const end = gate(r, "settings");

      guardLogin(r, redirect);
      holdTheRestore(r);
      r.back();
      await ticks();
      void r.navigate("settings").catch(() => undefined);

      // Registered between the restore's cancel and its rejection.
      const listener = redirectOnEnd(r, "error", redirect);

      await ticks();
      listener.arm();
      end(false);
      await ticks();
      await ticks();

      await expect(walk(r)).resolves.toStrictEqual(PAST_THE_SHOWN);
    },
  );

  it.each(
    NEWER_CASES.flatMap(([ending, timing]) =>
      ([".catch()", "a try around await"] as const).map(
        (handler) => [ending, timing, handler] as const,
      ),
    ),
  )(
    "after the newer navigation %s %s, its own rejection handler (%s) finds the stack on the entry the router shows",
    async (ending, timing, handler) => {
      const r = await make();
      const end = guardSettings(r, ending, timing);
      let seen: boolean | undefined;

      holdTheRestore(r);
      r.back();
      HANDLERS[handler](r, () => {
        seen = r.canGoForward();
        void r.navigate("login").catch(() => undefined);
      });
      await ticks();
      end();
      await ticks();

      expect(seen).toBe(false);
      await expect(walk(r)).resolves.toStrictEqual(PAST_THE_SHOWN);
    },
  );

  it.each(NEWER_CASES)(
    "after the newer navigation %s %s, a redirect its .catch() starts that commits after its own guard lands past the entry the router shows",
    async (ending, timing) => {
      const r = await make();
      const end = guardSettings(r, ending, timing);

      guardLogin(r, "commits after its own guard");
      holdTheRestore(r);
      r.back();
      void r.navigate("settings").catch(() => {
        void r.navigate("login").catch(() => undefined);
      });
      await ticks();
      end();
      await ticks();
      await ticks();

      await expect(walk(r)).resolves.toStrictEqual(PAST_THE_SHOWN);
    },
  );

  it.each(NEWER_CASES)(
    "after the newer navigation %s %s, a back() its rejection handler makes moves from the entry the router shows",
    async (ending, timing) => {
      const r = await make();
      const end = guardSettings(r, ending, timing);

      holdTheRestore(r);
      r.back();
      void r.navigate("settings").catch(() => {
        r.back();
      });
      await ticks();
      end();
      await ticks();

      await expect(walk(r)).resolves.toStrictEqual({
        end: "about/1",
        back: ["home"],
      });
    },
  );

  it.each(
    REDIRECTS.flatMap((redirect) =>
      ORDERS.map((order) => [redirect, order] as const),
    ),
  )(
    "a navigation refused at once that cancels the one the restore waits for ends the wait as that one's refusal does: a redirect a listener defers that %s, registered %s the plugin, lands where it does after one refusal",
    async (redirect, order) => {
      let listener: { arm: () => void } | undefined;
      const r = await make((created) => {
        if (order === "before") {
          listener = redirectOnEnd(created, "error", redirect);
        }
      });

      listener ??= redirectOnEnd(r, "error", redirect);
      guardLogin(r, redirect);
      gate(r, "settings");
      getLifecycleApi(r).addActivateGuard("profile", () => () => false);
      holdTheRestore(r);
      r.back();
      void r.navigate("settings").catch(() => undefined);
      await ticks();
      listener.arm();
      void r.navigate("profile").catch(() => undefined);
      await ticks();
      await ticks();

      await expect(walk(r)).resolves.toStrictEqual(
        LANDS["the newer navigation"][redirect],
      );
    },
  );

  it.each(
    REDIRECTS.flatMap((redirect) =>
      ORDERS.map((order) => [redirect, order] as const),
    ),
  )(
    "a navigateToNotFound() the shown route's canDeactivate refuses at once after it cancels the one the restore waits for: its refusal carries no state and ends nothing, so a redirect a listener of that refusal defers that %s, registered %s the plugin, lands past the entry the router shows",
    async (redirect, order) => {
      let listener: { arm: () => void } | undefined;
      const r = await make((created) => {
        if (order === "before") {
          listener = redirectOnEnd(created, "error", redirect);
        }
      });

      listener ??= redirectOnEnd(r, "error", redirect);
      guardLogin(r, redirect);
      gate(r, "settings");
      getLifecycleApi(r).addDeactivateGuard(
        "users",
        () => (toState) => toState.name !== constants.UNKNOWN_ROUTE,
      );
      holdTheRestore(r);
      r.back();
      void r.navigate("settings").catch(() => undefined);
      await ticks();
      listener.arm();

      expect(() => r.navigateToNotFound("/missing")).toThrow(
        expect.objectContaining({ code: errorCodes.CANNOT_DEACTIVATE }),
      );

      await ticks();
      await ticks();

      await expect(walk(r)).resolves.toStrictEqual(PAST_THE_SHOWN);
    },
  );

  it.each(
    LATE_ENDS.flatMap((how) =>
      [0, 1, 2, 3, 4, 5, 6].map((depth) => [how, depth] as const),
    ),
  )(
    "the newer navigation ends when %s %i microtasks after it cancels the restore: a redirect a listener registered before the plugin defers lands past the restore's target",
    async (how, depth) => {
      const controller = new AbortController();
      let end: (() => void) | undefined;
      const r = await make((created) => {
        end = endLate(created, how, controller);
      });

      gate(r, "settings");
      getLifecycleApi(r).addActivateGuard("profile", () => () => false);
      holdTheRestore(r);
      r.back();
      await ticks();
      void r
        .navigate("settings", {}, undefined, { signal: controller.signal })
        .catch(() => undefined);
      afterMicrotasks(depth, () => {
        end?.();
      });
      await ticks();
      await ticks();

      await expect(walk(r)).resolves.toStrictEqual(PAST_THE_TARGET);
    },
  );

  it.each(REDIRECTS)(
    "a navigation the caller of back() starts in the same task, after a guard cancels the restore quietly at once, lands where a redirect a TRANSITION_CANCEL listener defers does: it %s",
    async (redirect) => {
      const r = await make();
      let first = true;

      guardLogin(r, redirect);
      getLifecycleApi(r).addActivateGuard("about", () => () => {
        if (!first) {
          return true;
        }

        first = false;

        throw new RouterError(errorCodes.TRANSITION_CANCELLED);
      });
      r.back();
      startLogin(r, redirect);
      await ticks();
      await ticks();

      await expect(walk(r)).resolves.toStrictEqual(CANCEL_LANDS[redirect]);
    },
  );

  it.each(ORDERS)(
    "a restore refused inside the rejection handler of an earlier refusal keeps the stack for a redirect a listener of its own end defers, registered %s the plugin",
    async (order) => {
      let listener: { arm: () => void } | undefined;
      const r = await make((created) => {
        if (order === "before") {
          listener = redirectOnEnd(created, "error", "commits at once");
        }
      });
      let first = true;

      listener ??= redirectOnEnd(r, "error", "commits at once");
      getLifecycleApi(r).addActivateGuard("settings", () => () => false);
      getLifecycleApi(r).addActivateGuard("about", () => () => {
        if (!first) {
          return true;
        }

        first = false;

        return false;
      });
      void r.navigate("settings").catch(() => {
        listener?.arm();
        r.back();
      });
      await ticks();

      await expect(walk(r)).resolves.toStrictEqual(PAST_THE_TARGET);
    },
  );

  it.each(
    REDIRECTS.flatMap((redirect) =>
      ORDERS.map((order) => [redirect, order] as const),
    ),
  )(
    "after a guard cancels the restore quietly, a redirect a TRANSITION_CANCEL listener defers that %s lands where it does whether the listener is registered %s the plugin",
    async (redirect, order) => {
      let listener: { arm: () => void } | undefined;
      const r = await make((created) => {
        if (order === "before") {
          listener = redirectOnEnd(created, "cancel", redirect);
        }
      });
      let cancel: (() => void) | undefined;
      let first = true;

      listener ??= redirectOnEnd(r, "cancel", redirect);
      guardLogin(r, redirect);
      getLifecycleApi(r).addActivateGuard("about", () => () => {
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
      r.back();
      await ticks();
      listener.arm();
      cancel?.();
      await ticks();
      await ticks();

      await expect(walk(r)).resolves.toStrictEqual(CANCEL_LANDS[redirect]);
    },
  );

  it.each([0, 1, 2, 3, 4, 5, 6])(
    "the newer navigation's own signal aborts it %i microtasks after it cancels the restore, and a navigation a TRANSITION_CANCEL listener starts in a microtask is refused at once: a redirect a listener of that refusal defers lands past the restore's target",
    async (depth) => {
      let started: { arm: () => void } | undefined;
      let refused: { arm: () => void } | undefined;
      const r = await make((created) => {
        started = redirectOnEnd(
          created,
          "cancel",
          "commits at once",
          "profile",
        );
        refused = redirectOnEnd(created, "error", "commits at once");
      });
      const controller = new AbortController();

      gate(r, "settings");
      getLifecycleApi(r).addActivateGuard("profile", () => () => false);
      holdTheRestore(r);
      r.back();
      await ticks();
      void r
        .navigate("settings", {}, undefined, { signal: controller.signal })
        .catch(() => undefined);
      afterMicrotasks(depth, () => {
        started?.arm();
        refused?.arm();
        controller.abort();
      });
      await ticks();
      await ticks();

      await expect(walk(r)).resolves.toStrictEqual(PAST_THE_TARGET);
    },
  );

  it.each([
    ["users", "is refused before it starts", PAST_THE_SHOWN],
    ["nowhere", "is refused before it starts", PAST_THE_SHOWN],
    ["profile", "is refused at once", PAST_THE_TARGET],
  ] as const)(
    "after a guard cancels the restore quietly at once, a navigation to %s the caller starts then %s: a redirect a listener of that refusal defers lands where the end of a navigation that ran decides",
    async (target, _how, expected) => {
      let listener: { arm: () => void } | undefined;
      const r = await make((created) => {
        listener = redirectOnEnd(created, "error", "commits at once");
      });
      let first = true;

      getLifecycleApi(r).addActivateGuard("profile", () => () => false);
      getLifecycleApi(r).addActivateGuard("about", () => () => {
        if (!first) {
          return true;
        }

        first = false;

        throw new RouterError(errorCodes.TRANSITION_CANCELLED);
      });
      r.back();
      listener?.arm();
      void r.navigate(target).catch(() => undefined);
      await ticks();
      await ticks();

      await expect(walk(r)).resolves.toStrictEqual(expected);
    },
  );

  it.each([
    ["is refused at once", "profile", PAST_THE_TARGET],
    ["is refused before it starts", "nowhere", PAST_THE_SHOWN],
  ] as const)(
    "after a guard cancels the restore quietly, a navigation a TRANSITION_CANCEL listener starts in a microtask %s: a redirect a listener of that refusal defers lands where the end of a navigation that ran decides",
    async (_how, target, expected) => {
      let started: { arm: () => void } | undefined;
      let refused: { arm: () => void } | undefined;
      const r = await make((created) => {
        started = redirectOnEnd(created, "cancel", "commits at once", target);
        refused = redirectOnEnd(created, "error", "commits at once");
      });
      let cancel: (() => void) | undefined;
      let first = true;

      getLifecycleApi(r).addActivateGuard("profile", () => () => false);
      getLifecycleApi(r).addActivateGuard("about", () => () => {
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
      r.back();
      await ticks();
      started?.arm();
      refused?.arm();
      cancel?.();
      await ticks();
      await ticks();

      await expect(walk(r)).resolves.toStrictEqual(expected);
    },
  );

  it("a router whose listener limit refuses the wait drops the restore at its rejection: the newer navigation's commit after its own guard lands past the entry the router shows", async () => {
    // The plugin's own hooks hold the only slot of each event.
    const r = await make(undefined, 1);
    const end = gate(r, "settings");

    holdTheRestore(r);
    r.back();
    void r.navigate("settings").catch(() => undefined);
    await ticks();

    const dropped = r.canGoForward();

    end(true);
    await ticks();

    expect(dropped).toBe(false);
    await expect(walk(r)).resolves.toStrictEqual({
      end: "settings/3",
      back: ["users", "about", "home"],
    });
  });

  it.each([
    "commits after its own guard",
    "is refused by its own guard",
    "cancels quietly",
    "gives way to one that commits",
  ] as const)(
    "the wait ends with the newer navigation, which %s: it keeps no listener",
    async (ending) => {
      // The plugin's hooks hold one slot of each event, the wait one more.
      const r = await make(undefined, 2);
      const end = gate(r, "settings");

      holdTheRestore(r);
      r.back();
      void r.navigate("settings").catch(() => undefined);
      await ticks();

      const waiting = room(r, 2);

      endTheNewer(r, ending, end);
      await ticks();

      expect({ waiting, ended: room(r, 2) }).toStrictEqual({
        waiting: [1, 0, 0, 0],
        ended: [1, 1, 1, 1],
      });
    },
  );

  it("a router whose listener limit refuses one of the wait's listeners keeps none of them, and drops the restore at its rejection", async () => {
    // The plugin's hook and the app's listener fill TRANSITION_ERROR; the
    // wait takes TRANSITION_SUCCESS before it is refused there.
    const r = await make((created) => {
      getPluginApi(created).addEventListener(events.TRANSITION_ERROR, () => {});
    }, 2);
    const end = gate(r, "settings");

    holdTheRestore(r);
    r.back();
    void r.navigate("settings").catch(() => undefined);
    await ticks();

    const refused = { canGoForward: r.canGoForward(), room: room(r, 2) };

    end(true);
    await ticks();

    expect(refused).toStrictEqual({
      canGoForward: false,
      room: [1, 1, 0, 1],
    });
    await expect(walk(r)).resolves.toStrictEqual({
      end: "settings/3",
      back: ["users", "about", "home"],
    });
  });

  it.each([events.TRANSITION_ERROR, events.TRANSITION_CANCEL])(
    "the plugin's hooks take a %s slot: usePlugin() throws on a router whose listener limit is reached for it",
    async (event) => {
      const fill =
        (count: number) =>
        (created: MemoryRouter): void => {
          for (let i = 0; i < count; i++) {
            getPluginApi(created).addEventListener(event, () => {});
          }
        };

      await expect(make(fill(1), 2)).resolves.toBeDefined();
      await expect(make(fill(2), 2)).rejects.toThrow(
        `Listener limit (2) reached for "${event}"`,
      );
    },
  );

  it.each(["at once", "while its guard holds it"] as const)(
    "a restore a guard cancels quietly with nothing newer behind it keeps no listener of its wait, cancelled %s",
    async (timing) => {
      // The plugin's hooks hold one slot of each event, the wait one more.
      const r = await make(undefined, 2);
      let cancel: (() => void) | undefined;
      let first = true;

      getLifecycleApi(r).addActivateGuard("about", () => () => {
        if (!first) {
          return true;
        }

        first = false;

        if (timing === "at once") {
          throw new RouterError(errorCodes.TRANSITION_CANCELLED);
        }

        return new Promise<boolean>((_resolve, reject) => {
          cancel = () => {
            reject(new RouterError(errorCodes.TRANSITION_CANCELLED));
          };
        });
      });
      r.back();
      await ticks();
      cancel?.();
      await ticks();

      expect({ room: room(r, 2), ...(await walk(r)) }).toStrictEqual({
        room: [1, 1, 1, 1],
        ...STAYED,
      });
    },
  );

  it("a navigation that supersedes the one the restore waits for leaves the restore one wait", async () => {
    // The plugin's hooks hold one slot of each event, the wait one more.
    const r = await make(undefined, 3);

    gate(r, "settings");
    gate(r, "profile");
    holdTheRestore(r);
    r.back();
    void r.navigate("settings").catch(() => undefined);
    await ticks();
    void r.navigate("profile").catch(() => undefined);
    await ticks();

    expect(room(r, 3)).toStrictEqual([2, 1, 1, 1]);
  });

  it("a navigation cancelled with no restore in flight takes no listener", async () => {
    const r = await make(undefined, 2);

    gate(r, "settings");
    gate(r, "profile");
    void r.navigate("settings").catch(() => undefined);
    await ticks();
    void r.navigate("profile").catch(() => undefined);
    await ticks();

    expect(room(r, 2)).toStrictEqual([1, 1, 1, 1]);
  });

  it("two back() calls a guard holds, the second cancelled by a navigate(): the first restore's wait keeps no listener while that navigation runs", async () => {
    // The plugin's hooks hold one slot of each event, each wait one more.
    const r = await make(undefined, 3);
    const end = gate(r, "settings");

    holdTheRestore(r);
    holdFirst(r, "home");
    r.back();
    r.back();
    await ticks();
    void r.navigate("settings").catch(() => undefined);
    await ticks();

    const waiting = room(r, 3);

    end(false);
    await ticks();

    expect({ waiting, ended: room(r, 3) }).toStrictEqual({
      waiting: [2, 1, 1, 1],
      ended: [2, 2, 2, 2],
    });
  });

  it("unsubscribing the plugin while the restore waits removes the wait's listeners with its hooks", async () => {
    const r = await make(undefined, 2);

    gate(r, "settings");
    holdTheRestore(r);
    r.back();
    void r.navigate("settings").catch(() => undefined);
    await ticks();
    removeThePlugin?.();

    expect(room(r, 2)).toStrictEqual([2, 2, 2, 2]);
  });

  it.each(ORDERS)(
    "a back() a TRANSITION_ERROR listener registered %s the plugin defers after a refused back() keeps its own target while its guard holds it",
    async (order) => {
      let arm: (() => void) | undefined;
      const r = await make((created) => {
        if (order === "before") {
          arm = backOnError(created);
        }
      });

      arm ??= backOnError(r);
      getLifecycleApi(r).addActivateGuard("about", () => () => false);
      getLifecycleApi(r).addActivateGuard(
        "home",
        () => () => new Promise<boolean>(() => {}),
      );
      arm();
      r.back();
      await ticks();

      expect({
        route: r.getState()?.name,
        canGoBack: r.canGoBack(),
        canGoForward: r.canGoForward(),
      }).toStrictEqual({
        route: "users",
        canGoBack: false,
        canGoForward: true,
      });
    },
  );
});
