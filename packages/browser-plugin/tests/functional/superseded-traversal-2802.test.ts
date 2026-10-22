import {
  createRouter,
  errorCodes,
  events,
  RouterError,
} from "@real-router/core";
import { getLifecycleApi, getPluginApi } from "@real-router/core/api";
import { afterEach, describe, expect, it } from "vitest";

import { browserPluginFactory } from "@real-router/browser-plugin";

import { createSafeBrowser } from "../../src/browser-env";
import { routerConfig } from "../helpers/testUtils";

import type { Router } from "@real-router/core";

/**
 * #2802 — a Back that a newer router navigation cancels leaves what that
 * navigation's end decides, whenever it ends: one that commits writes its own
 * entry after the one the Back reached, which keeps its page; one that is
 * refused, or cancelled with nothing newer behind it, sends the browser back
 * to the entry the Back started from, as a refused Back does (#2740, #2796).
 *
 * History: `/sentinel`, `/sentinel`, `/home`, `/users/view/42`. The Back's leave
 * guard holds the first time; the newer navigation to `users.list` ends after
 * the Back settled, or, in a CONTROL, before it.
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

// The traversal, the transition and the plugin's own return each take a task.
const settle = async (): Promise<void> => {
  for (let i = 0; i < 8; i++) {
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  }
};

let router: Router | undefined;
let travelled: number;

async function setup({
  maxListeners,
  via,
}: { maxListeners?: number; via?: string } = {}): Promise<Router> {
  travelled = 0;
  globalThis.history.replaceState(null, "", "/sentinel");
  globalThis.history.pushState(null, "", "/sentinel");
  globalThis.history.pushState(null, "", "/home");

  const created = createRouter(routerConfig, {
    defaultRoute: "home",
    allowNotFound: true,
    ...(maxListeners !== undefined && { limits: { maxListeners } }),
  });
  const browser = createSafeBrowser(
    () => globalThis.location.pathname + globalThis.location.search,
    "browser-plugin",
  );

  created.usePlugin(
    browserPluginFactory(
      {},
      {
        ...browser,
        go: (delta) => {
          travelled++;
          browser.go?.(delta);
        },
      },
    ),
  );
  await created.start();
  router = created;

  if (via !== undefined) {
    await created.navigate(via);
  }

  await created.navigate("users.view", { id: "42" });

  return created;
}

const at = (): { path: string; route: string | undefined } => ({
  path: globalThis.location.pathname,
  route: router?.getState()?.name,
});

// The listener limit of the routers whose free slots a cell counts.
const LIMIT = 3;

/**
 * How many more listeners each transition event takes, up to `LIMIT`. The
 * ones it took are removed again.
 */
function freeSlots(r: Router): {
  start: number;
  error: number;
  cancel: number;
  success: number;
} {
  const api = getPluginApi(r);
  const take = (add: () => () => void): number => {
    const removers: (() => void)[] = [];

    try {
      while (removers.length < LIMIT) {
        removers.push(add());
      }
    } catch {
      // The limit refused the next one.
    }

    for (const remove of removers) {
      remove();
    }

    return removers.length;
  };

  return {
    start: take(() => api.addEventListener(events.TRANSITION_START, () => {})),
    error: take(() => api.addEventListener(events.TRANSITION_ERROR, () => {})),
    cancel: take(() =>
      api.addEventListener(events.TRANSITION_CANCEL, () => {}),
    ),
    success: take(() =>
      api.addEventListener(events.TRANSITION_SUCCESS, () => {}),
    ),
  };
}

/** Holds the Back's leave guard; every later leave is allowed. */
function holdTheBack(r: Router): void {
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
 * The newer navigation's guard, answered when `end` is called: `true` lets it
 * commit, `false` refuses it, a `RouterError` cancels it quietly (#933).
 */
function gate(r: Router): (answer: boolean | RouterError) => void {
  let end: ((answer: boolean | RouterError) => void) | undefined;

  getLifecycleApi(r).addActivateGuard(
    "users.list",
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

/** When the newer navigation ends: inside the call that cancels the Back, or after the Back settled. */
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
    const end = gate(r);

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

/**
 * Holds the Back's leave guard until the returned function cancels it
 * quietly (#933); every later leave is allowed.
 */
function cancelTheBackQuietly(r: Router): () => void {
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

/**
 * A listener of the end `event` names that, once armed, starts a navigation
 * to `to` in a microtask; the returned function arms it.
 */
function navigateOn(
  r: Router,
  event: "error" | "cancel",
  to: string,
  params?: Record<string, string>,
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
        void r.navigate(to, params).catch(() => undefined);
      });
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

/** Where the browser and the router end, and where one Back from there lands. */
async function walk(): Promise<{
  end: { path: string; route: string | undefined };
  travelled: number;
  back: string;
}> {
  const end = at();
  const travelledThen = travelled;

  globalThis.history.back();
  await settle();

  return { end, travelled: travelledThen, back: globalThis.location.pathname };
}

const RETURNED = {
  end: { path: "/users/view/42", route: "users.view" },
  travelled: 1,
  back: "/home",
};

const EXPECTED: Readonly<Record<Ending, typeof RETURNED>> = {
  "is refused": RETURNED,
  "cancels quietly": RETURNED,
  commits: {
    end: { path: "/users/list", route: "users.list" },
    travelled: 0,
    back: "/home",
  },
  "gives way to one that is refused": RETURNED,
  "gives way to one that commits": {
    end: { path: "/", route: "index" },
    travelled: 0,
    back: "/home",
  },
};

describe("#2802 — a Back a newer navigation cancels leaves what that navigation's end decides", () => {
  afterEach(() => {
    router?.stop();
    router = undefined;
  });

  it("the ending table names each expected ending once", () => {
    expect(ENDINGS).toHaveLength(Object.keys(EXPECTED).length);
    expect(new Set(ENDINGS)).toStrictEqual(new Set(Object.keys(EXPECTED)));
  });

  it.each(ENDINGS)(
    "the newer navigation %s after the Back settled",
    async (ending) => {
      const r = await setup();
      const end = gate(r);

      holdTheBack(r);
      globalThis.history.back();
      await settle();

      void r.navigate("users.list").catch(() => undefined);
      await settle();
      finish(r, ending, end);
      await settle();

      await expect(walk()).resolves.toStrictEqual(EXPECTED[ending]);
    },
  );

  it("the newer navigation commits a replace after the Back settled: it overwrites the entry the Back reached", async () => {
    const r = await setup();
    const end = gate(r);

    holdTheBack(r);
    globalThis.history.back();
    await settle();

    void r
      .navigate("users.list", {}, undefined, { replace: true })
      .catch(() => undefined);
    await settle();
    end(true);
    await settle();

    await expect(walk()).resolves.toStrictEqual({
      end: { path: "/users/list", route: "users.list" },
      travelled: 0,
      back: "/sentinel",
    });
  });

  it("while the newer navigation runs, nothing is written over the entry the Back reached", async () => {
    const r = await setup();

    gate(r);
    holdTheBack(r);
    globalThis.history.back();
    await settle();

    void r.navigate("users.list").catch(() => undefined);
    await settle();

    expect({ ...at(), travelled }).toStrictEqual({
      path: "/home",
      route: "users.view",
      travelled: 0,
    });
  });

  it.each(["is refused", "commits"] as const)(
    "CONTROL — the newer navigation %s before the Back settles",
    async (ending) => {
      const r = await setup();

      holdTheBack(r);
      getLifecycleApi(r).addActivateGuard(
        "users.list",
        () => () => ending === "commits",
      );
      globalThis.history.back();
      await settle();

      void r.navigate("users.list").catch(() => undefined);
      await settle();

      await expect(walk()).resolves.toStrictEqual(EXPECTED[ending]);
    },
  );

  it.each([
    ["a microtask", 0],
    ["a task", 1],
  ] as const)(
    "a redirect a TRANSITION_ERROR listener defers by %s after the newer navigation's refusal: the Back travels %i times",
    async (deferral, times) => {
      const r = await setup();
      const end = gate(r);
      let armed = false;

      getPluginApi(r).addEventListener(events.TRANSITION_ERROR, () => {
        if (!armed) {
          return;
        }

        armed = false;

        const go = (): void => {
          void r.navigate("index").catch(() => undefined);
        };

        if (deferral === "a task") {
          setTimeout(go, 0);
        } else {
          queueMicrotask(go);
        }
      });
      holdTheBack(r);
      globalThis.history.back();
      await settle();

      void r.navigate("users.list").catch(() => undefined);
      await settle();
      armed = true;
      end(false);
      await settle();

      expect({ ...at(), travelled }).toStrictEqual({
        path: "/",
        route: "index",
        travelled: times,
      });
    },
  );

  it.each(
    (["is refused", "cancels quietly"] as const).flatMap((ending) =>
      TIMINGS.map((timing) => [ending, timing] as const),
    ),
  )(
    "the newer navigation %s %s: a redirect its .catch() starts that commits after the Back returned writes after the entry the Back started from",
    async (ending, timing) => {
      const r = await setup();
      const end = endTheNewer(r, ending, timing);
      const letIn = holdTheIndex(r);

      holdTheBack(r);
      globalThis.history.back();
      await settle();

      void r.navigate("users.list").catch(() => {
        void r.navigate("index").catch(() => undefined);
      });
      await settle();
      end();
      await settle();
      letIn();
      await settle();

      await expect(walk()).resolves.toStrictEqual({
        end: { path: "/", route: "index" },
        travelled: 1,
        back: "/users/view/42",
      });
    },
  );

  it.each(["commits at once", "commits after its own guard"] as const)(
    "a navigation refused at once that cancels the newer one ends the watch as that one's refusal does: a redirect a TRANSITION_ERROR listener defers by a microtask that %s owns the URL",
    async (redirect) => {
      const r = await setup();
      let armed = false;

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

      gate(r);
      holdTheBack(r);
      getLifecycleApi(r).addActivateGuard("users.view", () => () => false);
      globalThis.history.back();
      await settle();

      void r.navigate("users.list").catch(() => undefined);
      await settle();
      armed = true;
      void r.navigate("users.view", { id: "1" }).catch(() => undefined);
      await settle();
      letIn();
      await settle();

      await expect(walk()).resolves.toStrictEqual({
        end: { path: "/", route: "index" },
        travelled: 0,
        back: "/home",
      });
    },
  );

  it.each(
    LATE_ENDS.flatMap((how) =>
      [0, 1, 2, 3, 4, 5, 6].map((depth) => [how, depth] as const),
    ),
  )(
    "the newer navigation ends when %s %i microtasks after it starts: a redirect a listener of that end defers by a microtask owns the URL",
    async (how, depth) => {
      const r = await setup();
      const controller = new AbortController();
      const end = endLate(r, how, controller);
      const letIn = holdTheIndex(r);

      gate(r);
      holdTheBack(r);
      globalThis.history.back();
      await settle();

      void r
        .navigate("users.list", {}, undefined, { signal: controller.signal })
        .catch(() => undefined);
      afterMicrotasks(depth, end);
      await settle();
      letIn();
      await settle();

      await expect(walk()).resolves.toStrictEqual({
        end: { path: "/", route: "index" },
        travelled: 0,
        back: "/home",
      });
    },
  );

  it.each([
    [
      "is refused at once",
      "users.list",
      { end: { path: "/", route: "index" }, travelled: 0, back: "/home" },
    ],
    [
      "is refused before it starts",
      "nowhere",
      {
        end: { path: "/", route: "index" },
        travelled: 1,
        back: "/users/view/42",
      },
    ],
  ] as const)(
    "after a guard cancels the Back quietly, a navigation a TRANSITION_CANCEL listener starts in a microtask %s: a redirect a listener of that refusal defers lands where the end of a navigation that ran decides",
    async (_how, target, expected) => {
      const r = await setup();
      const start = navigateOn(r, "cancel", target);
      const redirect = navigateOn(r, "error", "index");
      const letIn = holdTheIndex(r);
      const cancel = cancelTheBackQuietly(r);

      getLifecycleApi(r).addActivateGuard("users.list", () => () => false);
      globalThis.history.back();
      await settle();
      start();
      redirect();
      cancel();
      await settle();
      letIn();
      await settle();

      await expect(walk()).resolves.toStrictEqual(expected);
    },
  );

  it.each([0, 1, 2, 3, 4, 5, 6])(
    "the newer navigation's own signal aborts it %i microtasks after it starts, and a navigation a TRANSITION_CANCEL listener starts in a microtask is refused at once: a redirect a listener of that refusal defers owns the URL",
    async (depth) => {
      const r = await setup();
      const controller = new AbortController();
      const start = navigateOn(r, "cancel", "users.view", { id: "1" });
      const redirect = navigateOn(r, "error", "index");
      const letIn = holdTheIndex(r);

      getLifecycleApi(r).addActivateGuard("users.view", () => () => false);
      gate(r);
      holdTheBack(r);
      globalThis.history.back();
      await settle();

      void r
        .navigate("users.list", {}, undefined, { signal: controller.signal })
        .catch(() => undefined);
      afterMicrotasks(depth, () => {
        start();
        redirect();
        controller.abort();
      });
      await settle();
      letIn();
      await settle();

      await expect(walk()).resolves.toStrictEqual({
        end: { path: "/", route: "index" },
        travelled: 0,
        back: "/home",
      });
    },
  );

  it("a Back while the newer navigation runs decides in its place: one return, and the entry the first Back reached keeps its page", async () => {
    const r = await setup({ via: "index" });
    const end = gate(r);
    let leaves = 0;

    // The first Back's leave holds, the newer navigation's is allowed, and the
    // second Back's is refused.
    getLifecycleApi(r).addDeactivateGuard("users.view", () => () => {
      leaves++;

      if (leaves === 1) {
        return new Promise<boolean>(() => {});
      }

      return leaves !== 3;
    });
    globalThis.history.back(); // onto `/`
    await settle();

    void r.navigate("users.list").catch(() => undefined);
    await settle();

    // Onto `/home`: it cancels the newer navigation, is refused, and returns.
    globalThis.history.back();
    await settle();
    end(false);
    await settle();

    await expect(walk()).resolves.toStrictEqual({
      end: { path: "/users/view/42", route: "users.view" },
      travelled: 1,
      back: "/",
    });
  });

  it("a navigation refused before it starts while the newer one runs decides nothing", async () => {
    const r = await setup();
    const end = gate(r);

    holdTheBack(r);
    globalThis.history.back();
    await settle();

    void r.navigate("users.list").catch(() => undefined);
    await settle();
    // Refused against the committed state, with the newer one still running:
    // one error carries no state, the other a state of its own.
    await r.navigate("nowhere").catch(() => undefined);
    await r.navigate("users.view", { id: "42" }).catch(() => undefined);
    await settle();
    end(true);
    await settle();

    await expect(walk()).resolves.toStrictEqual(EXPECTED.commits);
  });

  it("stop() while the newer navigation runs leaves the browser where it is", async () => {
    const r = await setup();

    gate(r);
    holdTheBack(r);
    globalThis.history.back();
    await settle();

    void r.navigate("users.list").catch(() => undefined);
    await settle();
    r.stop();
    await settle();

    expect({ path: globalThis.location.pathname, travelled }).toStrictEqual({
      path: "/home",
      travelled: 0,
    });
  });

  it("a plugin removed while the newer navigation runs leaves the browser where it is", async () => {
    globalThis.history.replaceState(null, "", "/sentinel");
    globalThis.history.pushState(null, "", "/home");
    travelled = 0;

    const r = createRouter(routerConfig, { defaultRoute: "home" });
    const browser = createSafeBrowser(
      () => globalThis.location.pathname + globalThis.location.search,
      "browser-plugin",
    );
    const remove = r.usePlugin(
      browserPluginFactory(
        {},
        {
          ...browser,
          go: (delta) => {
            travelled++;
            browser.go?.(delta);
          },
        },
      ),
    );

    router = r;
    await r.start();
    await r.navigate("users.view", { id: "42" });

    const end = gate(r);

    holdTheBack(r);
    globalThis.history.back();
    await settle();

    void r.navigate("users.list").catch(() => undefined);
    await settle();

    remove();
    end(false);
    await settle();

    expect({ path: globalThis.location.pathname, travelled }).toStrictEqual({
      path: "/home",
      travelled: 0,
    });
  });

  it("a traversal a listener ends inside its announce settles at once: its watch keeps no listener", async () => {
    globalThis.history.replaceState(null, "", "/sentinel");
    globalThis.history.pushState(null, "", "/home");

    const r = createRouter(routerConfig, {
      defaultRoute: "home",
      limits: { maxListeners: LIMIT },
    });
    let stopOn: string | undefined;

    // Called before the watch: the cancel reaches it before the start does.
    r.usePlugin(() => ({
      onTransitionStart: (toState) => {
        if (toState.name === stopOn) {
          stopOn = undefined;
          r.stop();
        }
      },
    }));
    r.usePlugin(
      browserPluginFactory(
        {},
        createSafeBrowser(
          () => globalThis.location.pathname + globalThis.location.search,
          "browser-plugin",
        ),
      ),
    );
    router = r;
    await r.start();
    await r.navigate("users.list");
    stopOn = "home";
    globalThis.history.back();
    await settle();

    expect(r.isActive()).toBe(false);
    // The first plugin's `onTransitionStart` and browser-plugin's
    // `onTransitionSuccess` hold one slot each.
    expect(freeSlots(r)).toStrictEqual({
      start: 2,
      error: 3,
      cancel: 3,
      success: 2,
    });
  });

  it.each(
    (["is refused", "commits"] as const).flatMap((ending) =>
      TIMINGS.map((timing) => [ending, timing] as const),
    ),
  )(
    "the watch ends with the newer navigation, which %s %s: it keeps no listener, nor does a later Back's",
    async (ending, timing) => {
      const r = await setup({ maxListeners: LIMIT });
      const end = endTheNewer(r, ending, timing);
      // One TRANSITION_SUCCESS slot is the plugin's own `onTransitionSuccess`.
      const free = { start: 3, error: 3, cancel: 3, success: 2 };

      holdTheBack(r);
      globalThis.history.back();
      await settle();

      void r.navigate("users.list").catch(() => undefined);
      await settle();
      end();
      await settle();

      expect(freeSlots(r)).toStrictEqual(free);

      globalThis.history.back();
      await settle();

      expect({ ...at(), slots: freeSlots(r) }).toStrictEqual({
        path: "/home",
        route: "home",
        slots: free,
      });
    },
  );

  it.each([
    ["commits", true, { path: "/home", route: "home" }],
    ["is refused", false, { path: "/users/view/42", route: "users.view" }],
  ] as const)(
    "a Back that %s with nothing newer behind it keeps no listener of its watch",
    async (_ending, allowed, arrived) => {
      const r = await setup({ maxListeners: LIMIT });

      getLifecycleApi(r).addDeactivateGuard("users.view", () => () => allowed);
      globalThis.history.back();
      await settle();

      expect(at()).toStrictEqual(arrived);
      // One TRANSITION_SUCCESS slot is the plugin's own `onTransitionSuccess`.
      expect(freeSlots(r)).toStrictEqual({
        start: 3,
        error: 3,
        cancel: 3,
        success: 2,
      });
    },
  );
});
