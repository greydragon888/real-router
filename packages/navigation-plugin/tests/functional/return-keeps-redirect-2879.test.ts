import {
  createRouter,
  errorCodes,
  events,
  RouterError,
} from "@real-router/core";
import { getLifecycleApi, getPluginApi } from "@real-router/core/api";
import { afterEach, describe, expect, it, vi } from "vitest";

import { navigationPluginFactory } from "../../src";
import { PLUGIN_SYNC_INFO } from "../../src/navigation-browser";
import { MockNavigation } from "../helpers/mockNavigation";
import {
  createNavigationBrowserOver,
  routerConfig,
} from "../helpers/testUtils";

import type { Router } from "@real-router/core";

/**
 * #2879 — the plugin's return after a refused navigation is `traverseTo()`,
 * which commits a moment after the call (measured on Chromium 153, Firefox 155
 * and WebKit 26.6). A navigation the router commits owns the URL whenever it
 * commits: in that moment its write waits for the landing, so it lands on the
 * entry the router stands on, and in WebKit it does not abort the return.
 *
 * It runs on the plugin's own `createNavigationBrowser`, which owns the wait,
 * over a `MockNavigation` that commits `traverseTo()` a task after the call.
 * History: `/`, `/home`, `/users/view/42`. A Back leaves `users.view` for
 * `home`; a Forward, made after a Back the router took, leaves `home` for
 * `users.view`.
 */

const TRAVERSALS = ["Back", "Forward"] as const;

type Traversal = (typeof TRAVERSALS)[number];

const WRITES = ["replace", "push"] as const;

type Write = (typeof WRITES)[number];

interface Where {
  entries: string[];
  index: number | undefined;
  route: string | undefined;
}

/** Where a redirect to `index` ends, once the return has landed. */
const LANDED: Readonly<Record<Traversal, Readonly<Record<Write, Where>>>> = {
  Back: {
    replace: {
      entries: ["/", "/home", "/"],
      index: 2,
      route: "index",
    },
    push: {
      entries: ["/", "/home", "/users/view/42", "/"],
      index: 3,
      route: "index",
    },
  },
  Forward: {
    replace: {
      entries: ["/", "/", "/users/view/42"],
      index: 1,
      route: "index",
    },
    push: {
      entries: ["/", "/home", "/"],
      index: 2,
      route: "index",
    },
  },
};

const CELLS = TRAVERSALS.flatMap((traversal) =>
  WRITES.map((write) => [traversal, write] as const),
);

// Lets the handler, the router transition and the plugin's own traversal run.
const settle = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) {
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  }
};

let router: Router | undefined;
// What runs right after the plugin's own `traverseTo()` returns.
let afterTraverse: (() => void) | undefined;

async function setup(): Promise<{ mock: MockNavigation; router: Router }> {
  const mock = new MockNavigation("http://localhost/");
  const traverseTo = mock.traverseTo.bind(mock);

  mock.traverseTo = (key, options) => {
    const result = traverseTo(key, options);

    if (options?.info === PLUGIN_SYNC_INFO) {
      const next = afterTraverse;

      afterTraverse = undefined;
      next?.();
    }

    return result;
  };
  mock.deferTraversals();

  router = createRouter(routerConfig, {
    defaultRoute: "home",
    allowNotFound: true,
  });
  router.usePlugin(
    navigationPluginFactory({}, createNavigationBrowserOver(mock)),
  );
  await router.start("/");
  await router.navigate("home");
  await router.navigate("users.view", { id: "42" });

  return { mock, router };
}

const where = (mock: MockNavigation): Where => ({
  entries: mock.entries().map((entry) => new URL(entry.url).pathname),
  index: mock.currentEntry?.index,
  route: router?.getState()?.name,
});

/** Brings the router to the route the traversal leaves, and names it. */
async function standOn(
  mock: MockNavigation,
  traversal: Traversal,
): Promise<string> {
  if (traversal === "Back") {
    return "users.view";
  }

  mock.back();
  await settle();

  return "home";
}

function travel(mock: MockNavigation, traversal: Traversal): void {
  if (traversal === "Back") {
    mock.back();
  } else {
    mock.forward();
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
  "a guard refuses it": async (
    r: Router,
    mock: MockNavigation,
    traversal: Traversal,
  ) => {
    onFirstLeave(r, await standOn(mock, traversal), refuse);
    travel(mock, traversal);
  },
  "a newer navigation it was cancelled by is refused": async (
    r: Router,
    mock: MockNavigation,
    traversal: Traversal,
  ) => {
    const end = gate(r);

    onFirstLeave(r, await standOn(mock, traversal), hold);
    travel(mock, traversal);
    await settle();

    void r.navigate("users.list").catch(() => undefined);
    await settle();
    end(false);
  },
} as const;

const ARC_NAMES = Object.keys(ARCS) as (keyof typeof ARCS)[];

describe("#2879 — a return the plugin started does not take the router off a navigation it committed", () => {
  afterEach(() => {
    router?.stop();
    router = undefined;
    afterTraverse = undefined;
  });

  describe("the application's reaction to the end of the newer navigation comes before the return", () => {
    it.each(
      ENDINGS.flatMap((ending) =>
        WRITES.map((write) => [ending, write] as const),
      ),
    )(
      "CONTROL — the newer navigation %s: a %s its .catch() starts writes on the entry the Back reached, and the browser does not travel",
      async (ending, write) => {
        const { mock, router: r } = await setup();
        const end = gate(r);
        let returns = 0;

        afterTraverse = () => {
          returns++;
        };
        onFirstLeave(r, "users.view", hold);
        mock.back();
        await settle();

        void r.navigate("users.list").catch(() => {
          redirect(r, write);
        });
        await settle();
        end(ANSWERS[ending]());
        await settle();

        expect({ ...where(mock), returns }).toStrictEqual({
          ...LANDED.Forward[write],
          returns: 0,
        });
      },
    );

    it("a chain of promises deep enough to outlast the handler's own awaits lands the same way", async () => {
      const { mock, router: r } = await setup();
      const end = gate(r);

      onFirstLeave(r, "users.view", hold);
      mock.back();
      await settle();

      // What an application's `await` through a few async functions costs.
      void (async () => {
        try {
          await r.navigate("users.list");
        } catch {
          for (let i = 0; i < 12; i++) {
            await Promise.resolve();
          }

          redirect(r, "replace");
        }
      })();
      await settle();
      end(false);
      await settle();

      expect(where(mock)).toStrictEqual(LANDED.Forward.replace);
    });

    it("a redirect a TRANSITION_ERROR listener defers by a task owns the URL as well", async () => {
      const { mock, router: r } = await setup();
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
      mock.back();
      await settle();

      void r.navigate("users.list").catch(() => undefined);
      await settle();
      armed = true;
      end(false);
      await settle();

      expect(where(mock)).toStrictEqual(LANDED.Forward.replace);
    });
  });

  describe("a navigation committed while the return travels writes where the return lands", () => {
    it.each(
      ARC_NAMES.flatMap((arc) =>
        CELLS.map(([traversal, write]) => [arc, traversal, write] as const),
      ),
    )("%s, %s: a %s stands", async (arc, traversal, write) => {
      const { mock, router: r } = await setup();

      afterTraverse = () => {
        redirect(r, write);
      };
      await ARCS[arc](r, mock, traversal);
      await settle();

      expect(where(mock)).toStrictEqual(LANDED[traversal][write]);
    });

    it.each([
      ["replace", ["/", "/home", "/home"], 2],
      ["push", ["/", "/home", "/users/view/42", "/home"], 3],
    ] as const)(
      "a %s to the URL of the entry the Back reached writes on the entry the return lands on",
      async (write, entries, index) => {
        const { mock, router: r } = await setup();

        onFirstLeave(r, "users.view", refuse);
        afterTraverse = () => {
          redirect(r, write, "home");
        };
        mock.back();
        await settle();

        expect(where(mock)).toStrictEqual({
          entries,
          index,
          route: "home",
        });
      },
    );

    it("two navigations write in the order they committed, each with its own state", async () => {
      const { mock, router: r } = await setup();

      onFirstLeave(r, "users.view", refuse);
      afterTraverse = () => {
        redirect(r, "replace");
        redirect(r, "push", "home");
      };
      mock.back();
      await settle();

      expect(where(mock)).toStrictEqual({
        entries: ["/", "/home", "/", "/home"],
        index: 3,
        route: "home",
      });
      expect(
        mock
          .entries()
          .map((entry) => (entry.getState() as { name: string }).name),
      ).toStrictEqual(["index", "home", "index", "home"]);
    });

    it.each([
      ["replace", ["/", "/home", "/", "/users/view/42"], 3],
      ["push", ["/", "/home", "/users/view/42", "/", "/users/view/42"], 4],
    ] as const)(
      "after a held %s, a navigation back to the URL the return lands on writes an entry of its own",
      async (write, entries, index) => {
        const { mock, router: r } = await setup();

        onFirstLeave(r, "users.view", refuse);
        afterTraverse = () => {
          void r
            .navigate("index", {}, undefined, { replace: write === "replace" })
            .then(() => r.navigate("users.view", { id: "42" }));
        };
        mock.back();
        await settle();

        expect(where(mock)).toStrictEqual({
          entries,
          index,
          route: "users.view",
        });
      },
    );

    it("replaceHistoryState waits as well, with the state it was called with", async () => {
      const { mock, router: r } = await setup();

      onFirstLeave(r, "users.view", refuse);
      afterTraverse = () => {
        r.replaceHistoryState("index");
        r.replaceHistoryState("home");
      };
      mock.back();
      await settle();

      expect(where(mock)).toStrictEqual({
        entries: ["/", "/home", "/home"],
        index: 2,
        route: "users.view",
      });
      expect(mock.currentEntry?.getState()).toMatchObject({ name: "home" });
    });

    it("a commit to the URL the return lands on updates that entry's state", async () => {
      const { mock, router: r } = await setup();

      onFirstLeave(r, "users.view", refuse);
      afterTraverse = () => {
        void r
          .navigate("users.view", { id: "42" }, undefined, { reload: true })
          .catch(() => undefined);
      };
      mock.back();
      await settle();

      expect(where(mock)).toStrictEqual({
        entries: ["/", "/home", "/users/view/42"],
        index: 2,
        route: "users.view",
      });
      expect(
        mock
          .entries()
          .map((entry) => (entry.getState() as { name: string }).name),
      ).toStrictEqual(["index", "home", "users.view"]);
    });

    it("a Back refused after the landing returns to the entry the navigation wrote", async () => {
      const { mock, router: r } = await setup();

      onFirstLeave(r, "users.view", refuse);
      afterTraverse = () => {
        redirect(r, "push");
      };
      mock.back();
      await settle();

      onFirstLeave(r, "index", refuse);
      mock.back();
      await settle();

      expect(where(mock)).toStrictEqual(LANDED.Back.push);
    });

    it("the landing of an earlier traversal leaves the later one holding", async () => {
      const { mock, router: r } = await setup();

      await r.traverseToLast("home");
      await r.traverseToLast("index");
      await r.navigate("users.list");
      await settle();

      expect(where(mock)).toStrictEqual({
        entries: ["/", "/users/list"],
        index: 1,
        route: "users.list",
      });
    });

    it("a navigation committed after traverseToLast() writes on the entry it landed on (#2877)", async () => {
      const { mock, router: r } = await setup();
      const landed = r.traverseToLast("index");

      await landed;
      await r.navigate("users.list");
      await settle();

      expect(where(mock)).toStrictEqual({
        entries: ["/", "/users/list"],
        index: 1,
        route: "users.list",
      });
    });
  });

  describe("what the wait does not do", () => {
    it("a stop while the return travels writes nothing, and the document stays", async () => {
      const { mock, router: r } = await setup();

      onFirstLeave(r, "users.view", refuse);
      afterTraverse = () => {
        redirect(r, "replace");
        r.stop();
      };
      mock.back();
      await settle();

      expect(where(mock)).toStrictEqual({
        entries: ["/", "/home", "/users/view/42"],
        index: 2,
        route: undefined,
      });
      expect(mock.crossDocumentNavigations).toStrictEqual([]);
    });

    it("a return that never commits lets the write out once its bound passes", async () => {
      const { mock, router: r } = await setup();

      mock.hangTraversals();
      onFirstLeave(r, "users.view", refuse);
      afterTraverse = () => {
        redirect(r, "push");
      };
      mock.back();
      await settle();

      expect(where(mock).entries).toStrictEqual([
        "/",
        "/home",
        "/users/view/42",
      ]);

      await vi.waitFor(
        () => {
          expect(where(mock)).toStrictEqual({
            entries: ["/", "/home", "/"],
            index: 2,
            route: "index",
          });
        },
        { timeout: 3000, interval: 50 },
      );
    });

    it("a traversal the router starts drops the writes held before it", async () => {
      const { mock, router: r } = await setup();

      await r.traverseToLast("home");
      await r.navigate("index");
      await r.traverseToLast("users.view");
      await settle();

      expect(where(mock)).toStrictEqual({
        entries: ["/", "/home", "/users/view/42"],
        index: 2,
        route: "users.view",
      });
    });

    it("a return the browser aborts lets the write out where the browser stands", async () => {
      const { mock, router: r } = await setup();

      onFirstLeave(r, "users.view", refuse);
      afterTraverse = () => {
        redirect(r, "replace");
        // A navigation outside the router removes the entry the return goes to.
        mock.navigate("http://localhost/users/list", {
          info: PLUGIN_SYNC_INFO,
        });
      };
      mock.back();
      await settle();

      expect(where(mock)).toStrictEqual({
        entries: ["/", "/home", "/"],
        index: 2,
        route: "index",
      });
    });

    it("CONTROL — a commit after the return landed writes at once", async () => {
      const { mock, router: r } = await setup();

      onFirstLeave(r, "users.view", refuse);
      mock.back();
      await settle();
      await r.navigate("index", {}, undefined, { replace: true });

      expect(where(mock)).toStrictEqual({
        entries: ["/", "/home", "/"],
        index: 2,
        route: "index",
      });
    });
  });
});
