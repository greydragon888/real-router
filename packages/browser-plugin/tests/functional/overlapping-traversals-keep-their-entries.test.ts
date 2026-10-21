import { createRouter } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";
import { afterEach, describe, expect, it } from "vitest";

import { browserPluginFactory } from "@real-router/browser-plugin";

import { createSafeBrowser } from "../../src/browser-env";
import { routerConfig } from "../helpers/testUtils";

import type { Router } from "@real-router/core";

/**
 * Overlapping traversals: a guard holds one Back, and the next one arrives and
 * waits behind it. The first one's transition writes only onto the entry it
 * arrived at — never onto the entry the second one took the browser to — so
 * every entry keeps the page it holds whichever order they settle in. The
 * sequential arm is the CONTROL.
 */

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
  globalThis.history.replaceState(null, "", "/sentinel");
  globalThis.history.pushState(null, "", "/sentinel");
  globalThis.history.pushState(null, "", "/home");

  const created = createRouter(routerConfig, {
    defaultRoute: "home",
    allowNotFound: true,
  });

  created.usePlugin(
    browserPluginFactory(
      {},
      createSafeBrowser(
        () => globalThis.location.pathname + globalThis.location.search,
        "browser-plugin",
      ),
    ),
  );
  await created.start();
  router = created;

  return created;
}

const at = (): { path: string; route: string | undefined } => ({
  path: globalThis.location.pathname,
  route: router?.getState()?.name,
});

describe("two overlapping traversals keep every entry's page", () => {
  afterEach(() => {
    router?.stop();
    router = undefined;
  });

  /**
   * History: sentinel, sentinel, /home, /users/list, /users/view/42. A guard
   * holds leaving users.view until `release()`; leaving users.list is
   * refused, so a Back from /users/list is refused.
   */
  async function prepare(): Promise<{
    r: Router;
    release: () => Promise<void>;
  }> {
    const r = await setup();
    let answer: ((allowed: boolean) => void) | undefined;

    await r.navigate("users.list");
    await r.navigate("users.view", { id: "42" });
    getLifecycleApi(r).addDeactivateGuard(
      "users.view",
      () => () =>
        new Promise<boolean>((resolve) => {
          answer = resolve;
        }),
    );
    getLifecycleApi(r).addDeactivateGuard("users.list", () => () => false);

    return {
      r,
      release: async () => {
        answer?.(true);
        await settle();
      },
    };
  }

  const back = async (): Promise<void> => {
    globalThis.history.back();
    await settle();
  };

  /** Where the router stands, then where one Back and two Forwards lead. */
  async function walkAround(r: Router): Promise<{
    at: { path: string; route: string | undefined };
    oneBack: string;
    twoForward: string;
  }> {
    const stoodOn = at();

    r.stop();
    await back();

    const oneBack = globalThis.location.pathname;

    globalThis.history.forward();
    await settle();
    globalThis.history.forward();
    await settle();

    return { at: stoodOn, oneBack, twoForward: globalThis.location.pathname };
  }

  const EVERY_ENTRY_KEPT = {
    at: { path: "/users/list", route: "users.list" },
    oneBack: "/home",
    twoForward: "/users/view/42",
  };

  it("overlapping: the held Back commits while a refused one waits behind it", async () => {
    const { r, release } = await prepare();

    await back(); // lands on /users/list; its guard holds it
    await back(); // lands on /home, and waits
    await release(); // commits while the browser stands on /home

    await expect(walkAround(r)).resolves.toStrictEqual(EVERY_ENTRY_KEPT);
  });

  it("sequential (control): the held Back commits before the refused one", async () => {
    const { r, release } = await prepare();

    await back();
    await release();
    await back();

    await expect(walkAround(r)).resolves.toStrictEqual(EVERY_ENTRY_KEPT);
  });

  it("a write after a traversal settles lands where the browser stands", async () => {
    const r = await setup();

    await r.navigate("users.list");
    globalThis.history.back(); // a traversal that settles on /home
    await settle();
    await r.navigate("users.view", { id: "1" }); // a push from /home
    await r.navigate("users.view", { id: "2" }, undefined, { replace: true });

    expect(globalThis.location.pathname).toBe("/users/view/2");
  });
});
