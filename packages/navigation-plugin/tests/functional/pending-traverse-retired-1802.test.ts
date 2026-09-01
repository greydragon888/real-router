import { createRouter } from "@real-router/core";
import { describe, it, expect } from "vitest";

import { navigationPluginFactory } from "../../src";
import { MockNavigation } from "../helpers/mockNavigation";
import {
  createMockNavigationBrowser,
  routerConfig,
} from "../helpers/testUtils";

import type { NavigationBrowser } from "../../src/types";
import type { Route, Router } from "@real-router/core";

/**
 * #1802 — every way `traverseToLast`'s inner `navigate()` can fail must retire
 * the pending-traverse record, so the NEXT navigation reaches the browser as
 * the navigation it is.
 *
 * The discriminating shape is the facade's reentrancy refusal: it emits no
 * lifecycle hook at all, and the three hooks are the only writers that retire
 * the record. `ROUTE_NOT_FOUND` is absent from the table on purpose —
 * `resolveEntryToMatchedState` throws above the record's assignment, so an
 * unmatched entry never reaches `navigate()`.
 */

interface Env {
  router: Router;
  browser: NavigationBrowser;
  log: string[];
  dispose: () => void;
}

type TraverseRouter = Router & {
  traverseToLast: (routeName: string) => Promise<unknown>;
};

function createEnv(routes: Route[] = routerConfig): Env {
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
      log.push(`traverseTo(${key})`);
      base.traverseTo(key);
    },
  };
  const router = createRouter(routes, { defaultRoute: "home" });
  const unsubscribe = router.usePlugin(navigationPluginFactory({}, browser));

  return {
    router,
    browser,
    log,
    dispose: () => {
      router.stop();
      unsubscribe();
    },
  };
}

/** Puts a `users.list` entry in history, then parks on `home`. */
async function seedHistory(env: Env): Promise<void> {
  await env.router.start("/users/list");
  await env.router.navigate("home");
}

/**
 * Each cell drives one refusal shape at `traverseToLast` and returns the
 * browser calls produced by the FOLLOWING, unrelated navigation.
 */
const REFUSALS: {
  readonly name: string;
  readonly drive: () => Promise<{ refusal: string; nextNavigate: string[] }>;
}[] = [
  {
    name: "the facade's reentrancy refusal (no lifecycle hook fires)",
    drive: async () => {
      const env = createEnv();

      await env.router.start("/users/list");

      let refusal = "none";
      const off = env.router.subscribe(() => {
        void (env.router as TraverseRouter)
          .traverseToLast("users.list")
          .catch((error: unknown) => {
            refusal = (error as Error).message;
          });
      });

      await env.router.navigate("home");
      off();
      env.log.length = 0;
      await env.router.navigate("users.view", { id: "9" });

      const result = { refusal, nextNavigate: [...env.log] };

      env.dispose();

      return result;
    },
  },
  {
    name: "SAME_STATES",
    drive: async () => {
      const env = createEnv();

      await seedHistory(env);
      await env.router.navigate("users.list");

      let refusal = "none";

      await (env.router as TraverseRouter)
        .traverseToLast("users.list")
        .catch((error: unknown) => {
          refusal = (error as Error).message;
        });
      env.log.length = 0;
      await env.router.navigate("users.view", { id: "9" });

      const result = { refusal, nextNavigate: [...env.log] };

      env.dispose();

      return result;
    },
  },
  {
    name: "a canActivate rejection",
    drive: async () => {
      let blocked = false;
      const env = createEnv([
        {
          name: "users",
          path: "/users",
          children: [
            { name: "view", path: "/view/:id" },
            { name: "list", path: "/list", canActivate: () => () => !blocked },
          ],
        },
        { name: "home", path: "/home" },
        { name: "index", path: "/" },
      ]);

      await seedHistory(env);
      blocked = true;

      let refusal = "none";

      await (env.router as TraverseRouter)
        .traverseToLast("users.list")
        .catch((error: unknown) => {
          refusal = (error as Error).message;
        });
      env.log.length = 0;
      await env.router.navigate("users.view", { id: "9" });

      const result = { refusal, nextNavigate: [...env.log] };

      env.dispose();

      return result;
    },
  },
];

describe("navigation-plugin — a refused traverseToLast retires its record (#1802)", () => {
  it.each(REFUSALS)(
    "the navigation after $name reaches the browser as a navigate",
    async ({ drive }) => {
      const { refusal, nextNavigate } = await drive();

      expect(refusal).not.toBe("none");
      expect(nextNavigate).toStrictEqual(["navigate(/users/view/9,push)"]);
    },
  );

  it("the navigation after a refusal carries its own metadata, not the traverse's", async () => {
    const env = createEnv();

    await env.router.start("/users/list");

    const off = env.router.subscribe(() => {
      void (env.router as TraverseRouter)
        .traverseToLast("users.list")
        .catch(() => undefined);
    });

    await env.router.navigate("home");
    off();
    await env.router.navigate("users.view", { id: "9" });

    const meta = env.router.getState()!.context.navigation!;

    expect(meta.navigationType).toBe("push");
    expect(meta.direction).toBe("forward");

    env.dispose();
  });

  it("a traverseToLast that is NOT refused still traverses", async () => {
    const env = createEnv();

    await seedHistory(env);
    env.log.length = 0;
    await (env.router as TraverseRouter).traverseToLast("users.list");

    // The mock's key counter is module-global, so pin the call, not the key.
    expect(env.log).toHaveLength(1);
    expect(env.log[0]).toMatch(/^traverseTo\(/);

    env.dispose();
  });
});
