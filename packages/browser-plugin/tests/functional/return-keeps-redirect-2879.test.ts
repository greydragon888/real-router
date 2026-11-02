import {
  createRouter,
  errorCodes,
  events,
  RouterError,
  UNKNOWN_ROUTE,
} from "@real-router/core";
import { getLifecycleApi, getPluginApi } from "@real-router/core/api";
import { afterEach, describe, expect, it, vi } from "vitest";

import { browserPluginFactory } from "@real-router/browser-plugin";

import { createSafeBrowser } from "../../src/browser-env";
import { routerConfig } from "../helpers/testUtils";

import type { Router } from "@real-router/core";

/**
 * #2879 — the plugin's return after a refused or cancelled traversal is
 * `history.go()`: nothing calls it back, and the browser lands a moment after
 * the call. A navigation the router commits owns the URL whenever it commits:
 * before the return starts it starts none, and in that moment its write waits
 * for the landing, so the landing cannot take the router off it.
 *
 * History: `/sentinel`, `/sentinel`, `/home`, `/users/view/42`. A Back leaves
 * `users.view` for `home`; a Forward, made after a Back the router took, leaves
 * `home` for `users.view`.
 */

const TRAVERSALS = ["Back", "Forward"] as const;

type Traversal = (typeof TRAVERSALS)[number];

const WRITES = ["replace", "push"] as const;

type Write = (typeof WRITES)[number];

/** Where one Back from a redirect written on the entry a Back reached lands. */
const BEHIND_THE_ENTRY_REACHED: Readonly<Record<Write, string>> = {
  replace: "/sentinel",
  push: "/home",
};

/** Where one Back from the redirect lands, once the return has landed. */
const BEHIND: Readonly<Record<Traversal, Readonly<Record<Write, string>>>> = {
  Back: { replace: "/home", push: "/users/view/42" },
  Forward: BEHIND_THE_ENTRY_REACHED,
};

// The traversal, the transition and the plugin's own return each take a task.
const settle = async (): Promise<void> => {
  for (let i = 0; i < 8; i++) {
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  }
};

/** Before the bound of a hold passes, a dropped write looks like a held one. */
const outlastTheBound = async (): Promise<void> => {
  await new Promise((resolve) => {
    setTimeout(resolve, 1100);
  });
};

let router: Router | undefined;
let travelled: number;
// What runs right after the plugin's `history.go()` returns.
let afterGo: (() => void) | undefined;
// Whether `history.go()` travels: a browser may ignore the call (MDN).
let goes: boolean;

async function setup(): Promise<Router> {
  travelled = 0;
  afterGo = undefined;
  goes = true;
  globalThis.history.replaceState(null, "", "/sentinel");
  globalThis.history.pushState(null, "", "/sentinel");
  globalThis.history.pushState(null, "", "/home");

  const created = createRouter(routerConfig, {
    defaultRoute: "home",
    allowNotFound: true,
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

          if (goes) {
            browser.go?.(delta);
          }

          const next = afterGo;

          afterGo = undefined;
          next?.();
        },
      },
    ),
  );
  await created.start();
  router = created;
  await created.navigate("users.view", { id: "42" });

  return created;
}

/** Brings the router to the route the traversal leaves, and names it. */
async function standOn(traversal: Traversal): Promise<string> {
  if (traversal === "Back") {
    return "users.view";
  }

  globalThis.history.back();
  await settle();

  return "home";
}

function travel(traversal: Traversal): void {
  if (traversal === "Back") {
    globalThis.history.back();
  } else {
    globalThis.history.forward();
  }
}

/** Answers the first leave of `route` with `first`; every later one is allowed. */
function onFirstLeave(
  r: Router,
  route: string,
  first: () => boolean | Promise<boolean>,
): void {
  let answered = false;

  getLifecycleApi(r).addDeactivateGuard(route, () => () => {
    if (answered) {
      return true;
    }

    answered = true;

    return first();
  });
}

const refuse = (): boolean => false;
const hold = async (): Promise<boolean> =>
  new Promise<boolean>(() => undefined);

/** The guard of `users.list`, answered when the returned function is called. */
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

const redirect = (r: Router, write: Write, to = "index"): void => {
  void r
    .navigate(to, {}, undefined, { replace: write === "replace" })
    .catch(() => undefined);
};

/** The newer navigation's two endings that leave the traversal to return. */
const ANSWERS = {
  "is refused": () => false,
  "cancels quietly": () => new RouterError(errorCodes.TRANSITION_CANCELLED),
} as const;

const ENDINGS = Object.keys(ANSWERS) as (keyof typeof ANSWERS)[];

/** The arcs that end in the plugin's return, up to the moment it starts. */
const ARCS = {
  "a guard refuses it": async (r: Router, traversal: Traversal) => {
    onFirstLeave(r, await standOn(traversal), refuse);
    travel(traversal);
  },
  "a newer navigation it was cancelled by is refused": async (
    r: Router,
    traversal: Traversal,
  ) => {
    const end = gate(r);

    onFirstLeave(r, await standOn(traversal), hold);
    travel(traversal);
    await settle();

    void r.navigate("users.list").catch(() => undefined);
    await settle();
    end(false);
  },
} as const;

const ARC_NAMES = Object.keys(ARCS) as (keyof typeof ARCS)[];

const at = (): { path: string; route: string | undefined } => ({
  path: globalThis.location.pathname,
  route: router?.getState()?.name,
});

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

const AT_THE_REDIRECT = { path: "/", route: "index" };

const CELLS = TRAVERSALS.flatMap((traversal) =>
  WRITES.map((write) => [traversal, write] as const),
);

describe("#2879 — a return the plugin started does not take the router off a navigation it committed", () => {
  afterEach(() => {
    router?.stop();
    router = undefined;
    vi.useRealTimers();
  });

  describe("the application's reaction to the end of the newer navigation comes before the return", () => {
    it.each(
      ENDINGS.flatMap((ending) =>
        WRITES.map((write) => [ending, write] as const),
      ),
    )(
      "the newer navigation %s: a %s its .catch() starts writes on the entry the Back reached, and the browser does not travel",
      async (ending, write) => {
        const r = await setup();
        const end = gate(r);

        onFirstLeave(r, "users.view", hold);
        globalThis.history.back();
        await settle();

        void r.navigate("users.list").catch(() => {
          redirect(r, write);
        });
        await settle();
        end(ANSWERS[ending]());
        await settle();

        await expect(walk()).resolves.toStrictEqual({
          end: AT_THE_REDIRECT,
          travelled: 0,
          back: BEHIND_THE_ENTRY_REACHED[write],
        });
      },
    );

    it("a redirect a TRANSITION_ERROR listener defers by a task owns the URL as well", async () => {
      const r = await setup();
      const end = gate(r);
      let armed = false;

      getPluginApi(r).addEventListener(events.TRANSITION_ERROR, () => {
        if (armed) {
          armed = false;
          setTimeout(() => {
            redirect(r, "replace");
          }, 0);
        }
      });
      onFirstLeave(r, "users.view", hold);
      globalThis.history.back();
      await settle();

      void r.navigate("users.list").catch(() => undefined);
      await settle();
      armed = true;
      end(false);
      await settle();

      await expect(walk()).resolves.toStrictEqual({
        end: AT_THE_REDIRECT,
        travelled: 0,
        back: BEHIND_THE_ENTRY_REACHED.replace,
      });
    });
  });

  describe("a navigation committed while the return travels writes where the return lands", () => {
    it.each(
      ARC_NAMES.flatMap((arc) =>
        CELLS.map(([traversal, write]) => [arc, traversal, write] as const),
      ),
    )("%s, %s: a %s stands", async (arc, traversal, write) => {
      const r = await setup();

      afterGo = () => {
        redirect(r, write);
      };
      await ARCS[arc](r, traversal);
      await settle();

      await expect(walk()).resolves.toStrictEqual({
        end: AT_THE_REDIRECT,
        travelled: 1,
        back: BEHIND[traversal][write],
      });
    });

    it.each(WRITES)(
      "a %s to the URL of the entry the Back reached writes on the entry the return lands on",
      async (write) => {
        const r = await setup();

        onFirstLeave(r, "users.view", refuse);
        afterGo = () => {
          redirect(r, write, "home");
        };
        globalThis.history.back();
        await settle();

        await expect(walk()).resolves.toStrictEqual({
          end: { path: "/home", route: "home" },
          travelled: 1,
          back: BEHIND.Back[write],
        });
      },
    );

    it("two navigations write in the order they committed", async () => {
      const r = await setup();

      onFirstLeave(r, "users.view", refuse);
      afterGo = () => {
        redirect(r, "replace");
        redirect(r, "push", "home");
      };
      globalThis.history.back();
      await settle();

      await expect(walk()).resolves.toStrictEqual({
        end: { path: "/home", route: "home" },
        travelled: 1,
        back: "/",
      });

      globalThis.history.back();
      await settle();

      expect(globalThis.location.pathname).toBe("/home");
    });

    it("two pushes write a state each", async () => {
      const r = await setup();

      onFirstLeave(r, "users.view", refuse);
      afterGo = () => {
        redirect(r, "push");
        redirect(r, "push", "home");
      };
      globalThis.history.back();
      await settle();

      await expect(walk()).resolves.toStrictEqual({
        end: { path: "/home", route: "home" },
        travelled: 1,
        back: "/",
      });
    });

    it("the entry a held replace lands on stays measured: a Back refused from it returns", async () => {
      const r = await setup();

      onFirstLeave(r, "users.view", refuse);
      onFirstLeave(r, "index", refuse);
      afterGo = () => {
        redirect(r, "replace");
      };
      globalThis.history.back();
      await settle();

      globalThis.history.back();
      await settle();

      expect({ ...at(), travelled }).toStrictEqual({
        ...AT_THE_REDIRECT,
        travelled: 2,
      });

      globalThis.history.back();
      await settle();

      expect(globalThis.location.pathname).toBe("/home");
    });

    it("replaceHistoryState waits as well, with the state it was called with", async () => {
      const r = await setup();

      onFirstLeave(r, "users.view", refuse);
      afterGo = () => {
        r.replaceHistoryState("index");
        r.replaceHistoryState("home");
      };
      globalThis.history.back();
      await settle();

      expect(globalThis.location.pathname).toBe("/home");
      expect(globalThis.history.state).toMatchObject({
        name: "home",
        path: "/home",
      });
      expect(r.getState()?.name).toBe("users.view");
      expect(travelled).toBe(1);
    });
  });

  describe("what the wait does not do", () => {
    it("a stop while the return travels writes nothing", async () => {
      const r = await setup();

      onFirstLeave(r, "users.view", refuse);
      afterGo = () => {
        redirect(r, "replace");
        r.stop();
      };
      globalThis.history.back();
      await settle();
      await outlastTheBound();

      expect(globalThis.location.pathname).toBe("/users/view/42");

      globalThis.history.back();
      await settle();

      expect(globalThis.location.pathname).toBe("/home");
    });

    it.each(WRITES)(
      "a traversal the browser makes in place of the return decides, and a %s held for the return is dropped",
      async (write) => {
        const r = await setup();

        await r.navigate("users.list");
        goes = false;
        onFirstLeave(r, "users.list", refuse);
        afterGo = () => {
          redirect(r, write);
          globalThis.history.back();
        };
        globalThis.history.back();
        await settle();

        expect(at()).toStrictEqual({ path: "/home", route: "home" });

        globalThis.history.forward();
        await settle();

        expect(at()).toStrictEqual({
          path: "/users/view/42",
          route: "users.view",
        });

        await r.navigate("users.list");

        expect(at()).toStrictEqual({
          path: "/users/list",
          route: "users.list",
        });
      },
    );

    it.each(WRITES)(
      "a traversal onto an entry no plugin wrote decides as well, and a %s is dropped",
      async (write) => {
        const r = await setup();

        goes = false;
        onFirstLeave(r, "users.view", refuse);
        afterGo = () => {
          redirect(r, write);
          globalThis.history.back();
        };
        globalThis.history.back();
        await settle();

        expect(at()).toStrictEqual({
          path: "/sentinel",
          route: UNKNOWN_ROUTE,
        });

        globalThis.history.forward();
        await settle();

        expect(at()).toStrictEqual({ path: "/home", route: "home" });
      },
    );

    it("a traversal between the end of the newer navigation and the decision takes the decision's place", async () => {
      const r = await setup();
      const end = gate(r);
      // The Back, the newer navigation's leave, and the Back in the window.
      const answers = [hold, () => true, refuse];

      await r.navigate("index");
      getLifecycleApi(r).addDeactivateGuard(
        "index",
        () => () => answers.shift()?.() ?? true,
      );
      globalThis.history.back();
      await settle();

      void r.navigate("users.list").catch(() => undefined);
      await settle();
      // jsdom takes a Back in two `setImmediate` tasks, and the decision waits
      // a `setTimeout`. The end runs in the check phase of the Back's second
      // task, ahead of it, so the popstate lands before any timer can fire.
      await new Promise<void>((resolve) => {
        setImmediate(() => {
          setImmediate(() => {
            end(false);
            resolve();
          });
        });
        globalThis.history.back();
      });
      await settle();

      expect({ ...at(), travelled }).toStrictEqual({
        ...AT_THE_REDIRECT,
        travelled: 1,
      });
    });

    it("a return the browser ignored lets the write out once its bound passes", async () => {
      const r = await setup();

      goes = false;
      onFirstLeave(r, "users.view", refuse);
      afterGo = () => {
        redirect(r, "replace");
      };
      globalThis.history.back();
      await settle();

      expect(globalThis.location.pathname).toBe("/home");

      await vi.waitFor(
        () => {
          expect(globalThis.location.pathname).toBe("/");
        },
        { timeout: 3000, interval: 50 },
      );

      expect(r.getState()?.name).toBe("index");
    });

    it("CONTROL — a guard's quiet cancel with a Back queued behind it returns at once, and the Back is dropped", async () => {
      const r = await setup();
      let asked = 0;
      let cancel: (() => void) | undefined;

      await r.navigate("users.list");
      getLifecycleApi(r).addDeactivateGuard("users.list", () => () => {
        asked++;

        return new Promise<boolean>((_resolve, reject) => {
          cancel = () => {
            reject(new RouterError(errorCodes.TRANSITION_CANCELLED));
          };
        });
      });
      globalThis.history.back();
      await settle();
      globalThis.history.back();
      await settle();
      cancel?.();
      await settle();

      expect({ ...at(), asked, travelled }).toStrictEqual({
        path: "/users/list",
        route: "users.list",
        asked: 1,
        travelled: 1,
      });
    });

    it("CONTROL — a commit after the return landed writes at once", async () => {
      const r = await setup();

      onFirstLeave(r, "users.view", refuse);
      globalThis.history.back();
      await settle();
      await r.navigate("index", {}, undefined, { replace: true });

      expect(globalThis.location.pathname).toBe("/");
    });
  });
});
