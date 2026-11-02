import { createRouter } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";
import { afterEach, describe, expect, it } from "vitest";

import { hashPluginFactory } from "@real-router/hash-plugin";

import { createSafeBrowser } from "../../src/browser-env";
import { routerConfig } from "../helpers/testUtils";

import type { Router } from "@real-router/core";

/**
 * #2879 — the popstate handler and the positions are browser-plugin's
 * (`browser-env`), so a navigation the router commits owns the URL here too:
 * before the plugin's return starts it starts none, and while the return
 * travels its write waits for the landing. It runs through the
 * popstate/hashchange pair hash-plugin listens to. browser-plugin's
 * `return-keeps-redirect-2879.test.ts` owns the cells of the wait.
 *
 * History: `#/home`, `#/users/view/42`, after a first entry of the run.
 */

type Write = "replace" | "push";

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
// What runs right after the plugin's `history.go()` returns.
let afterGo: (() => void) | undefined;
// Whether the plugin's `history.go()` moves the browser.
let goes: boolean;

async function setup(): Promise<Router> {
  travelled = 0;
  afterGo = undefined;
  goes = true;
  globalThis.history.pushState(null, "", "/#/sentinel");
  globalThis.history.pushState(null, "", "/#/home");

  const created = createRouter(routerConfig, {
    defaultRoute: "home",
    allowNotFound: true,
  });
  const browser = createSafeBrowser(
    () => globalThis.location.hash.slice(1),
    "hash-plugin",
  );

  created.usePlugin(
    hashPluginFactory(
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

const at = (): { path: string; route: string | undefined } => ({
  path: globalThis.location.hash.slice(1),
  route: router?.getState()?.name,
});

/** Answers the first leave of `route` with `first`; later ones are allowed. */
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

/** The guard of `users.list`, answered when the returned function is called. */
function gate(r: Router): (answer: boolean) => void {
  let end: ((answer: boolean) => void) | undefined;

  getLifecycleApi(r).addActivateGuard(
    "users.list",
    () => () =>
      new Promise<boolean>((resolve) => {
        end = resolve;
      }),
  );

  return (answer) => end?.(answer);
}

const redirect = (r: Router, write: Write): void => {
  void r
    .navigate("index", {}, undefined, { replace: write === "replace" })
    .catch(() => undefined);
};

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

  return {
    end,
    travelled: travelledThen,
    back: globalThis.location.hash.slice(1),
  };
}

const AT_THE_REDIRECT = { path: "/", route: "index" };

describe("#2879 — a return the plugin started does not take the router off a navigation it committed", () => {
  afterEach(() => {
    router?.stop();
    router = undefined;
  });

  it.each([
    ["replace", "/sentinel"],
    ["push", "/home"],
  ] as const)(
    "a %s the .catch() of a refused newer navigation starts writes on the entry the Back reached, and the browser does not travel",
    async (write, back) => {
      const r = await setup();
      const end = gate(r);

      onFirstLeave(
        r,
        "users.view",
        async () => new Promise<boolean>(() => undefined),
      );
      globalThis.history.back();
      await settle();

      void r.navigate("users.list").catch(() => {
        redirect(r, write);
      });
      await settle();
      end(false);
      await settle();

      await expect(walk()).resolves.toStrictEqual({
        end: AT_THE_REDIRECT,
        travelled: 0,
        back,
      });
    },
  );

  it.each([
    ["replace", "/home"],
    ["push", "/users/view/42"],
  ] as const)(
    "a %s committed while the return travels stands, written where the return lands",
    async (write, back) => {
      const r = await setup();

      onFirstLeave(r, "users.view", () => false);
      afterGo = () => {
        redirect(r, write);
      };
      globalThis.history.back();
      await settle();

      await expect(walk()).resolves.toStrictEqual({
        end: AT_THE_REDIRECT,
        travelled: 1,
        back,
      });
    },
  );

  it.each(["replace", "push"] as const)(
    "a traversal the browser makes in place of the return decides, and a %s held for the return is dropped",
    async (write) => {
      const r = await setup();

      await r.navigate("users.list");
      goes = false;
      onFirstLeave(r, "users.list", () => false);
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
    },
  );

  it.each([
    ["replace", "/home"],
    ["push", "/users/view/42"],
  ] as const)(
    "the hashchange of the refused traversal, past the reset of the pair, leaves the return travelling, and a %s held for it stands",
    async (write, back) => {
      const r = await setup();

      goes = false;
      onFirstLeave(r, "users.view", () => false);
      afterGo = () => {
        redirect(r, write);
      };
      globalThis.history.back();
      await settle();

      // A burst of traversals carries it past the reset (measured).
      globalThis.dispatchEvent(new HashChangeEvent("hashchange"));
      await settle();
      globalThis.history.forward(); // The return lands.
      await settle();

      await expect(walk()).resolves.toStrictEqual({
        end: AT_THE_REDIRECT,
        travelled: 1,
        back,
      });
    },
  );

  it("CONTROL — a fragment navigation while the return travels decides", async () => {
    const r = await setup();

    goes = false;
    onFirstLeave(r, "users.view", () => false);
    globalThis.history.back();
    await settle();

    globalThis.location.hash = "#/users/list";
    await settle();

    expect(at()).toStrictEqual({ path: "/users/list", route: "users.list" });
  });
});
