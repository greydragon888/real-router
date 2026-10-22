import { createRouter, errorCodes, RouterError } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";
import { afterEach, describe, expect, it } from "vitest";

import { hashPluginFactory } from "@real-router/hash-plugin";

import { routerConfig } from "../helpers/testUtils";

import type { Router } from "@real-router/core";

/**
 * #2802 — the popstate handler is browser-plugin's (`browser-env`), so a Back a
 * newer navigation cancels leaves what that navigation's end decides here too:
 * one that commits writes after the entry the Back reached, which keeps its
 * page; one that is refused, or cancelled with nothing newer behind it, sends
 * the browser back to the entry the Back started from. browser-plugin's
 * `superseded-traversal-2802.test.ts` owns the cells of the decision's
 * lifetime.
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

async function setup(): Promise<Router> {
  globalThis.history.replaceState(null, "", "/#/sentinel");
  globalThis.history.pushState(null, "", "/#/sentinel");
  globalThis.history.pushState(null, "", "/#/home");

  const created = createRouter(routerConfig, { defaultRoute: "home" });

  created.usePlugin(hashPluginFactory());
  await created.start();
  router = created;
  await created.navigate("users.view", { id: "42" });

  return created;
}

const at = (): { path: string; route: string | undefined } => ({
  path: globalThis.location.hash.slice(1),
  route: router?.getState()?.name,
});

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

/** The guard of `users.list`, which ends the newer navigation at once. */
function endTheNewerAtOnce(
  r: Router,
  ending: "is refused" | "cancels quietly",
): void {
  getLifecycleApi(r).addActivateGuard("users.list", () => () => {
    if (ending === "cancels quietly") {
      throw new RouterError(errorCodes.TRANSITION_CANCELLED);
    }

    return false;
  });
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

/** Where the browser and the router end, and where one Back from there lands. */
async function walk(): Promise<{
  end: { path: string; route: string | undefined };
  back: string;
}> {
  const end = at();

  globalThis.history.back();
  await settle();

  return { end, back: globalThis.location.hash.slice(1) };
}

const RETURNED = {
  end: { path: "/users/view/42", route: "users.view" },
  back: "/home",
};

const EXPECTED: Readonly<Record<Ending, typeof RETURNED>> = {
  "is refused": RETURNED,
  "cancels quietly": RETURNED,
  commits: { end: { path: "/users/list", route: "users.list" }, back: "/home" },
  "gives way to one that is refused": RETURNED,
  "gives way to one that commits": {
    end: { path: "/", route: "index" },
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
      const end = gate(r, "users.list");

      holdTheLeave(r);
      globalThis.history.back();
      await settle();

      void r.navigate("users.list").catch(() => undefined);
      await settle();

      switch (ending) {
        case "is refused": {
          end(false);

          break;
        }
        case "cancels quietly": {
          end(new RouterError(errorCodes.TRANSITION_CANCELLED));

          break;
        }
        case "commits": {
          end(true);

          break;
        }
        case "gives way to one that is refused": {
          getLifecycleApi(r).addActivateGuard("index", () => () => false);
          void r.navigate("index").catch(() => undefined);

          break;
        }
        case "gives way to one that commits": {
          void r.navigate("index");
        }
      }

      await settle();

      await expect(walk()).resolves.toStrictEqual(EXPECTED[ending]);
    },
  );

  it("while the newer navigation runs, nothing is written over the entry the Back reached", async () => {
    const r = await setup();

    gate(r, "users.list");
    holdTheLeave(r);
    globalThis.history.back();
    await settle();

    void r.navigate("users.list").catch(() => undefined);
    await settle();

    expect(at()).toStrictEqual({ path: "/home", route: "users.view" });
  });

  it.each(["is refused", "commits"] as const)(
    "CONTROL — the newer navigation %s before the Back settles",
    async (ending) => {
      const r = await setup();

      holdTheLeave(r);
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

  it.each(["is refused", "cancels quietly"] as const)(
    "the newer navigation %s at once: a redirect its .catch() starts that commits after the Back returned writes after the entry the Back started from",
    async (ending) => {
      const r = await setup();
      const letIn = holdTheIndex(r);

      endTheNewerAtOnce(r, ending);
      holdTheLeave(r);
      globalThis.history.back();
      await settle();

      void r.navigate("users.list").catch(() => {
        void r.navigate("index").catch(() => undefined);
      });
      await settle();
      letIn();
      await settle();

      await expect(walk()).resolves.toStrictEqual({
        end: { path: "/", route: "index" },
        back: "/users/view/42",
      });
    },
  );

  // The entry the browser makes for the fragment carries no position: no
  // return can be measured from it, and a refusal rewrites it (#2740).
  it.each([
    [
      "commits",
      true,
      { end: { path: "/", route: "index" }, back: "/users/list" },
    ],
    [
      "is refused",
      false,
      {
        end: { path: "/users/view/42", route: "users.view" },
        back: "/users/view/42",
      },
    ],
  ] as const)(
    "a fragment navigation a newer one cancels, which %s after it settled: its entry keeps its page, or takes the router's URL",
    async (_ending, allowed, expected) => {
      const r = await setup();
      const end = gate(r, "index");

      getLifecycleApi(r).addActivateGuard(
        "users.list",
        () => () => new Promise<boolean>(() => {}),
      );
      globalThis.location.hash = "#/users/list";
      await settle();

      void r.navigate("index").catch(() => undefined);
      await settle();
      end(allowed);
      await settle();

      await expect(walk()).resolves.toStrictEqual(expected);
    },
  );
});
