import { createRouter } from "@real-router/core";
import { describe, expect, it } from "vitest";

import { navigationPluginFactory } from "../../src";
import { MockNavigation } from "../helpers/mockNavigation";
import { createMockNavigationBrowser } from "../helpers/testUtils";

import type { NavigationBrowser } from "../../src/types";
import type { Route, Router } from "@real-router/core";

/**
 * A superseded traverse must not retire its SUCCESSOR's record (#2067).
 *
 * ⚑ **The record is a plugin-global slot with no owner.** `traverseToLast`
 * stages `#capturedMeta` / `#pendingTraverseKey` synchronously, then calls
 * `navigate()`. When a second call stages its own record and supersedes the
 * first, core fires the FIRST transition's `onTransitionCancel` — which retires
 * whatever is in the slot, and by then that is the second call's record. The
 * second navigation goes on to succeed, finds no `traverseKey`, and degrades
 * into a plain `push`.
 *
 * ⚠ **Not #1802, and the two pull in opposite directions.** There the record
 * SURVIVES a navigation that never started, so a later unrelated navigation
 * replayed a stale traverse; here it is retired too eagerly, by a transition
 * that does not own it. A fix for either that ignores the other re-opens it.
 *
 * ⚠ **The user-visible half is the history stack, not the metadata.** A traverse
 * that degrades to a push does not return to the entry the user meant — it
 * leaves that entry behind them and puts a duplicate in front.
 */
interface Env {
  router: Router;
  log: string[];
  dispose: () => void;
}

type TraverseRouter = Router & {
  traverseToLast: (routeName: string) => Promise<unknown>;
};

/** `users.list` holds its activation open for a tick, so a second call can
 * supersede the first while it is still in flight. */
function routes(gate: () => boolean | Promise<boolean>): Route[] {
  return [
    {
      name: "users",
      path: "/users",
      children: [
        { name: "view", path: "/view/:id" },
        { name: "list", path: "/list", canActivate: () => () => gate() },
      ],
    },
    { name: "home", path: "/home" },
    { name: "index", path: "/" },
  ];
}

function createEnv(routeConfig: Route[]): Env {
  const mock = new MockNavigation("http://localhost/");
  const base = createMockNavigationBrowser(mock);
  const log: string[] = [];
  const browser: NavigationBrowser = {
    ...base,
    get currentEntry() {
      return base.currentEntry;
    },
    navigate: (url, options) => {
      log.push(`navigate(${url},${options.history})`);
      base.navigate(url, options);
    },
    traverseTo: (key) => {
      log.push("traverseTo");
      base.traverseTo(key);
    },
  };
  const router = createRouter(routeConfig, { defaultRoute: "home" });
  const unsubscribe = router.usePlugin(navigationPluginFactory({}, browser));

  return {
    router,
    log,
    dispose: () => {
      router.stop();
      unsubscribe();
    },
  };
}

describe("a superseded traverse leaves its successor's record alone (#2067)", () => {
  it("the SECOND traverseToLast still reaches the browser as a traverse", async () => {
    // The guard lets everything through until it is ARMED — seeding must not
    // deadlock on the very hold this cell needs later.
    let armed = false;
    let openTheGuard: () => void = () => undefined;
    const held = new Promise<boolean>((resolve) => {
      openTheGuard = () => {
        resolve(true);
      };
    });

    const env = createEnv(routes(() => (armed ? held : true)));

    // Two entries in history, then park somewhere else so both are behind us.
    await env.router.start("/users/list");
    await env.router.navigate("users.view", { id: "7" });
    await env.router.navigate("home");
    env.log.length = 0;

    armed = true;

    const traverse = env.router as TraverseRouter;

    // A holds on its guard; B supersedes it while A is still in flight.
    // A holds on its guard; B supersedes it while A is still in flight, so core
    // cancels A — measured, `a` rejects with CANCELLED and `b` resolves.
    const a = traverse.traverseToLast("users.list").catch(() => undefined);
    const b = traverse.traverseToLast("users.view");

    openTheGuard();
    await Promise.all([a, b]);

    const committed = env.router.getState();

    expect(env.log).toStrictEqual(["traverseTo"]);
    expect(committed?.context.navigation).toStrictEqual({
      navigationType: "traverse",
      userInitiated: false,
      direction: "back",
      sourceElement: null,
    });

    env.dispose();
  });
});
