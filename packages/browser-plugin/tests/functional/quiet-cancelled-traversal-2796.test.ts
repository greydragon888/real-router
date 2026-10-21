import { createRouter, errorCodes, RouterError } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";
import { afterEach, describe, expect, it } from "vitest";

import { browserPluginFactory } from "@real-router/browser-plugin";

import { createSafeBrowser } from "../../src/browser-env";
import { routerConfig } from "../helpers/testUtils";

import type { Router } from "@real-router/core";

/**
 * #2796 — a guard that cancels a Back quietly (#933) has no newer navigation
 * behind it: nothing else runs, and the router stays where it was. The plugin
 * treats it as the refusal it is and takes the browser back to the entry the
 * traversal started from, so the page the Back was for stays in history. A
 * traversal a NEWER navigation cancels is the other case, held by
 * `refused-traversal-returns-2740.test.ts`.
 */

type Verdict =
  | "refuses (control)"
  | "throws RouterError(TRANSITION_CANCELLED)"
  | "rejects with RouterError(TRANSITION_CANCELLED)"
  | "throws an AbortError";

const VERDICTS: readonly Verdict[] = [
  "refuses (control)",
  "throws RouterError(TRANSITION_CANCELLED)",
  "rejects with RouterError(TRANSITION_CANCELLED)",
  "throws an AbortError",
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

async function setup(): Promise<Router> {
  travelled = 0;
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
          browser.go?.(delta);
        },
      },
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

describe("#2796 — a Back a guard cancels quietly returns to the entry it started from", () => {
  afterEach(() => {
    router?.stop();
    router = undefined;
  });

  it("the verdict table holds each verdict once", () => {
    expect(VERDICTS).toHaveLength(new Set(VERDICTS).size);
  });

  it.each(VERDICTS)(
    "a canDeactivate guard that %s: the page the Back was for is still one Back away",
    async (verdict) => {
      const r = await setup();

      await r.navigate("users.view", { id: "42" });

      let active = true;

      getLifecycleApi(r).addDeactivateGuard("users.view", () => () => {
        if (!active) {
          return true;
        }

        switch (verdict) {
          case "refuses (control)": {
            return false;
          }
          case "throws RouterError(TRANSITION_CANCELLED)": {
            throw new RouterError(errorCodes.TRANSITION_CANCELLED);
          }
          case "rejects with RouterError(TRANSITION_CANCELLED)": {
            return Promise.reject(
              new RouterError(errorCodes.TRANSITION_CANCELLED),
            );
          }
          case "throws an AbortError": {
            throw new DOMException("aborted", "AbortError");
          }
        }
      });

      globalThis.history.back();
      await settle();

      expect(at()).toStrictEqual({
        path: "/users/view/42",
        route: "users.view",
      });

      active = false;
      globalThis.history.back();
      await settle();

      expect(at()).toStrictEqual({ path: "/home", route: "home" });
    },
  );

  describe("a newer navigation behind the cancel", () => {
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

    it("still running when the Back settles: it owns the URL, and the plugin does not travel", async () => {
      const r = await setup();
      let release: ((allowed: boolean) => void) | undefined;

      await r.navigate("users.view", { id: "42" });
      holdTheBack(r);
      getLifecycleApi(r).addActivateGuard(
        "users.list",
        () => () =>
          new Promise<boolean>((resolve) => {
            release = resolve;
          }),
      );

      globalThis.history.back();
      await settle();

      const newer = r.navigate("users.list");

      await settle();

      expect(travelled).toBe(0);

      release?.(true);
      await newer;
      await settle();

      expect(travelled).toBe(0);
      expect(at()).toStrictEqual({ path: "/users/list", route: "users.list" });
    });

    it("refused before the Back settles: nothing owns the URL, and the Back returns", async () => {
      const r = await setup();

      await r.navigate("users.view", { id: "42" });
      holdTheBack(r);
      getLifecycleApi(r).addActivateGuard("users.list", () => () => false);

      globalThis.history.back();
      await settle();
      await r.navigate("users.list").catch(() => {});
      await settle();

      expect(travelled).toBe(1);
      expect(at()).toStrictEqual({
        path: "/users/view/42",
        route: "users.view",
      });

      globalThis.history.back();
      await settle();

      expect(at()).toStrictEqual({ path: "/home", route: "home" });
    });
  });
});
