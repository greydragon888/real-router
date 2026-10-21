import { createRouter, errorCodes, RouterError } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";
import { afterEach, describe, expect, it } from "vitest";

import { navigationPluginFactory } from "../../src";
import { MockNavigation } from "../helpers/mockNavigation";
import {
  createMockNavigationBrowser,
  routerConfig,
} from "../helpers/testUtils";

import type { Router } from "@real-router/core";

/**
 * #2796 — a guard that cancels a browser navigation quietly (#933) has no newer
 * navigation behind it: the router stays where it was, and the plugin returns
 * to the entry the navigation started from, as it does for a refused one
 * (#2740). A newer navigation that owns the URL keeps it.
 *
 * And the handler's record of the navigation it took belongs to that
 * navigation: one that arrives clears its own, never a newer one's.
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

// Lets the handler, the router transition and the plugin's own traversal run.
const settle = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) {
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  }
};

let router: Router | undefined;

async function setup(): Promise<{ mock: MockNavigation; router: Router }> {
  const mock = new MockNavigation("http://localhost/home");

  router = createRouter(routerConfig, {
    defaultRoute: "home",
    allowNotFound: true,
  });
  router.usePlugin(
    navigationPluginFactory({}, createMockNavigationBrowser(mock)),
  );
  await router.start();

  return { mock, router };
}

const where = (
  mock: MockNavigation,
): {
  entries: string[];
  index: number | undefined;
  route: string | undefined;
} => ({
  entries: mock.entries().map((entry) => new URL(entry.url).pathname),
  index: mock.currentEntry?.index,
  route: router?.getState()?.name,
});

/** Holds the guard of the first leave of `users.view`; every later one allows. */
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

describe("#2796 — a navigation a guard cancels quietly returns to the entry it started from", () => {
  afterEach(() => {
    router?.stop();
    router = undefined;
  });

  it("the verdict table holds each verdict once", () => {
    expect(VERDICTS).toHaveLength(new Set(VERDICTS).size);
  });

  it.each(VERDICTS)(
    "Back left by a canDeactivate guard that %s: the browser stands where the router does",
    async (verdict) => {
      const { mock, router: r } = await setup();

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

      mock.back();
      await settle();

      expect(where(mock)).toStrictEqual({
        entries: ["/home", "/users/view/42"],
        index: 1,
        route: "users.view",
      });

      active = false;
      mock.back();
      await settle();

      expect(where(mock)).toMatchObject({ index: 0, route: "home" });
    },
  );

  describe("a newer router navigation behind the cancel", () => {
    it("still running when the Back settles: it owns the URL", async () => {
      const { mock, router: r } = await setup();
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

      mock.back();
      await settle();

      const newer = r.navigate("users.list");

      await settle();

      expect(where(mock)).toMatchObject({ index: 0, route: "users.view" });

      release?.(true);
      await newer;
      await settle();

      expect(where(mock)).toStrictEqual({
        entries: ["/home", "/users/list"],
        index: 1,
        route: "users.list",
      });
    });

    it("refused before the Back settles: nothing owns the URL, and the Back returns", async () => {
      const { mock, router: r } = await setup();

      await r.navigate("users.view", { id: "42" });
      holdTheBack(r);
      getLifecycleApi(r).addActivateGuard("users.list", () => () => false);

      mock.back();
      await settle();
      await r.navigate("users.list").catch(() => {});
      await settle();

      expect(where(mock)).toStrictEqual({
        entries: ["/home", "/users/view/42"],
        index: 1,
        route: "users.view",
      });
    });
  });
});

describe("the watch over newer navigations ends with the navigation", () => {
  afterEach(() => {
    router?.stop();
    router = undefined;
  });

  it("a router capped at three listeners per event takes navigation after navigation", async () => {
    const mock = new MockNavigation("http://localhost/home");

    router = createRouter(routerConfig, {
      defaultRoute: "home",
      allowNotFound: true,
      limits: { maxListeners: 3 },
    });
    router.usePlugin(
      navigationPluginFactory({}, createMockNavigationBrowser(mock)),
    );
    await router.start();

    const destinations = [
      "/users/list",
      "/home",
      "/users/list",
      "/home",
      "/users/list",
    ];

    for (const path of destinations) {
      mock.navigate(`http://localhost${path}`);
      await settle();
    }

    expect(router.getState()?.path).toBe("/users/list");
    expect(mock.entries()).toHaveLength(destinations.length + 1);
  });
});

describe("the handler's record belongs to the navigation it took", () => {
  afterEach(() => {
    router?.stop();
    router = undefined;
  });

  it("a navigation that arrives after a newer one was taken leaves the newer one's record", async () => {
    const { mock, router: r } = await setup();
    const lifecycle = getLifecycleApi(r);

    // The second navigation waits on its guard for good; the third is refused.
    lifecycle.addActivateGuard(
      "users.view",
      () => () => new Promise<boolean>(() => {}),
    );
    lifecycle.addActivateGuard("index", () => () => false);

    let armed = true;

    r.subscribe(({ route }) => {
      if (!armed || route.name !== "users.list") {
        return;
      }

      armed = false;
      // Taken before the first navigation's handler resumes after its commit.
      queueMicrotask(() => {
        mock.navigate("http://localhost/users/view/1");
      });
    });

    mock.navigate("http://localhost/users/list"); // the first: no guard, commits
    await settle();
    mock.navigate("http://localhost/"); // the third: refused
    await settle();

    // The router stands on `users.list`, and so does the browser: the
    // refusal returns to the entry the router stood on, not the second one's.
    expect(where(mock)).toMatchObject({ index: 1, route: "users.list" });
  });
});
