import { createRouter } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";
import { afterEach, describe, expect, it, vi } from "vitest";

import { navigationPluginFactory } from "../../src";
import { MockNavigation } from "../helpers/mockNavigation";
import { createMockNavigationBrowser } from "../helpers/testUtils";

import type {
  NavigationOptions,
  Route,
  Options,
  Router,
} from "@real-router/core";

/**
 * The browser commits an intercepted navigation's entry before the router
 * runs. When the router lands on a URL other than the one the browser
 * committed — a `forwardTo` target, a trailing slash it strips, a default
 * query it adds — the plugin rewrites that entry: the navigation leaves one
 * entry, and Back from it leaves the page.
 */
const users = { name: "users", path: "/users" };

const CASES: readonly {
  name: string;
  routes: Route[];
  options: Partial<Options>;
  href: string;
  landsOn: string;
}[] = [
  {
    name: "a forwardTo source",
    routes: [
      { name: "home", path: "/home" },
      { ...users, children: [{ name: "list", path: "/list" }] },
      { name: "old", path: "/old", forwardTo: "users.list" },
    ],
    options: {},
    href: "/old",
    landsOn: "/users/list",
  },
  {
    name: "a trailing slash the router strips",
    routes: [
      { name: "home", path: "/home" },
      { ...users, children: [{ name: "list", path: "/list" }] },
    ],
    options: { trailingSlash: "never" },
    href: "/users/list/",
    landsOn: "/users/list",
  },
  {
    name: "a default query the router adds",
    routes: [
      { name: "home", path: "/home" },
      {
        ...users,
        children: [
          { name: "list", path: "/list?page", defaultSearch: { page: "1" } },
        ],
      },
    ],
    options: {},
    href: "/users/list",
    landsOn: "/users/list?page=1",
  },
];

const paths = (mock: MockNavigation): string[] =>
  mock.entries().map((entry) => {
    const url = new URL(entry.url);

    return url.pathname + url.search + url.hash;
  });

const settle = async (): Promise<void> => {
  for (let i = 0; i < 6; i++) {
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  }
};

let router: Router | undefined;

async function start(
  routes: Route[],
  options: Partial<Options>,
  url = "http://localhost/home",
): Promise<{ router: Router; mock: MockNavigation }> {
  const mock = new MockNavigation(url);

  router = createRouter(routes, { defaultRoute: "home", ...options });
  router.usePlugin(
    navigationPluginFactory({}, createMockNavigationBrowser(mock)),
  );
  await router.start();

  return { router, mock };
}

describe("a push the browser makes to a URL the router rewrites (#2744)", () => {
  afterEach(() => {
    router?.stop();
    router = undefined;
  });

  it.each(CASES)(
    "$name: one entry, rewritten to the router's URL",
    async (kase) => {
      const { mock } = await start(kase.routes, kase.options);

      mock.navigate(`http://localhost${kase.href}`);
      await settle();

      expect(paths(mock)).toStrictEqual(["/home", kase.landsOn]);
      expect(mock.currentEntry?.index).toBe(1);
    },
  );

  it.each(CASES)(
    "$name: Back from it returns to the page before",
    async (kase) => {
      const { router: started, mock } = await start(kase.routes, kase.options);

      mock.navigate(`http://localhost${kase.href}`);
      await settle();
      mock.back();
      await settle();

      expect(started.getState()?.name).toBe("home");
      expect(mock.currentEntry?.index).toBe(0);
    },
  );

  it.each(CASES)(
    "$name: the navigation is still reported as a push",
    async (kase) => {
      const { router: started, mock } = await start(kase.routes, kase.options);

      mock.navigate(`http://localhost${kase.href}`);
      await settle();

      expect(started.getState()?.context.navigation?.navigationType).toBe(
        "push",
      );
    },
  );

  it("control: a push to the router's own URL leaves one entry", async () => {
    const [kase] = CASES;
    const { router: started, mock } = await start(kase.routes, kase.options);

    mock.navigate("http://localhost/users/list");
    await settle();

    expect(paths(mock)).toStrictEqual(["/home", "/users/list"]);
    expect(started.getState()?.name).toBe("users.list");
    expect(mock.crossDocumentNavigations).toStrictEqual([]);
  });

  it("control: a replace keeps the one entry it replaced", async () => {
    const [kase] = CASES;
    const { mock } = await start(kase.routes, kase.options);

    mock.navigate("http://localhost/old", { history: "replace" });
    await settle();

    expect(paths(mock)).toStrictEqual(["/users/list"]);
  });

  it("control: a traversal onto a URL the router rewrites rewrites that entry", async () => {
    const [kase] = CASES;
    const mock = new MockNavigation("http://localhost/old");

    mock.navigate("http://localhost/home");
    router = createRouter(kase.routes, { defaultRoute: "home" });
    router.usePlugin(
      navigationPluginFactory({}, createMockNavigationBrowser(mock)),
    );
    await router.start();
    mock.back();
    await settle();

    expect(paths(mock)).toStrictEqual(["/users/list", "/home"]);
    expect(mock.currentEntry?.index).toBe(0);
  });
});

/**
 * The router already shows the route the browser lands on, so it answers
 * `SAME_STATES` and no transition runs. The entry the browser committed still
 * gets the router's URL, as the History API plugins resync it.
 */
const COMMITS = [
  { arc: "push", entries: 2, index: 1 },
  { arc: "replace", entries: 1, index: 0 },
] as const;

const COMMIT_CELLS = CASES.flatMap((kase) =>
  COMMITS.map((commit) => ({ ...kase, ...commit })),
);

describe("a navigation the browser makes to an alias of the route the router shows (#2744)", () => {
  afterEach(() => {
    router?.stop();
    router = undefined;
  });

  it.each(COMMIT_CELLS)(
    "$name, $arc: the entry gets the router's URL",
    async (cell) => {
      const { router: started, mock } = await start(
        cell.routes,
        cell.options,
        `http://localhost${cell.landsOn}`,
      );

      mock.navigate(`http://localhost${cell.href}`, { history: cell.arc });
      await settle();

      expect(paths(mock)).toStrictEqual(
        Array.from({ length: cell.entries }, () => cell.landsOn),
      );
      expect(mock.currentEntry?.index).toBe(cell.index);
      expect(started.getState()?.path).toBe(cell.landsOn);
    },
  );

  it.each(CASES)(
    "$name, traverse: the entry gets the router's URL",
    async (kase) => {
      const mock = new MockNavigation(`http://localhost${kase.href}`);

      mock.navigate(`http://localhost${kase.landsOn}`);
      router = createRouter(kase.routes, {
        defaultRoute: "home",
        ...kase.options,
      });
      router.usePlugin(
        navigationPluginFactory({}, createMockNavigationBrowser(mock)),
      );
      await router.start();
      mock.back();
      await settle();

      expect(paths(mock)).toStrictEqual([kase.landsOn, kase.landsOn]);
      expect(mock.currentEntry?.index).toBe(0);
      expect(router.getState()?.path).toBe(kase.landsOn);
    },
  );

  it("control: an entry already at the router's URL is not written", async () => {
    const [kase] = CASES;
    const mock = new MockNavigation("http://localhost/users/list");
    const browser = createMockNavigationBrowser(mock);

    router = createRouter(kase.routes, { defaultRoute: "home" });
    router.usePlugin(navigationPluginFactory({}, browser));
    await router.start();

    const navigate = vi.spyOn(browser, "navigate");
    const replaceState = vi.spyOn(browser, "replaceState");

    mock.navigate("http://localhost/users/list");
    await settle();

    expect(router.getState()?.name).toBe("users.list");
    expect(paths(mock)).toStrictEqual(["/users/list"]);
    expect(navigate).not.toHaveBeenCalled();
    expect(replaceState).not.toHaveBeenCalled();
  });

  it("the entry gets the router's URL under `base`", async () => {
    const [kase] = CASES;
    const mock = new MockNavigation("http://localhost/app/users/list");

    router = createRouter(kase.routes, { defaultRoute: "home" });
    router.usePlugin(
      navigationPluginFactory(
        { base: "/app" },
        createMockNavigationBrowser(mock),
      ),
    );
    await router.start("/users/list");
    mock.navigate("http://localhost/app/old");
    await settle();

    expect(paths(mock)).toStrictEqual(["/app/users/list", "/app/users/list"]);
  });

  it("control: an entry whose URL the browser does not report is not written", async () => {
    const [kase] = CASES;
    const mock = new MockNavigation("http://localhost/users/list");
    const browser = { ...createMockNavigationBrowser(mock) };

    Object.defineProperty(browser, "currentEntry", { get: () => null });
    router = createRouter(kase.routes, { defaultRoute: "home" });
    router.usePlugin(navigationPluginFactory({}, browser));
    await router.start();

    const navigate = vi.spyOn(browser, "navigate");

    mock.navigate("http://localhost/old");
    await settle();

    expect(router.getState()?.name).toBe("users.list");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("a refused replace on a URL whose trailing slash the router keeps restores that slash", async () => {
    const [kase] = CASES;
    const { router: started, mock } = await start(
      kase.routes,
      kase.options,
      "http://localhost/users/list/",
    );

    getLifecycleApi(started).addActivateGuard("home", () => () => false);
    mock.navigate("http://localhost/home", { history: "replace" });
    await settle();

    expect(started.getState()?.path).toBe("/users/list/");
    expect(paths(mock)).toStrictEqual(["/users/list/"]);
  });

  it("control: a trailing slash the router keeps stays in the entry", async () => {
    const [kase] = CASES;
    const { router: started, mock } = await start(
      kase.routes,
      kase.options,
      "http://localhost/users/list/",
    );

    mock.navigate("http://localhost/users/list/");
    await settle();
    mock.navigate("http://localhost/users/list/");
    await settle();

    expect(started.getState()?.path).toBe("/users/list/");
    expect(paths(mock)).toStrictEqual(["/users/list/"]);
  });

  it("a fragment on the alias is the one the router publishes", async () => {
    const [kase] = CASES;
    const { router: started, mock } = await start(
      kase.routes,
      kase.options,
      "http://localhost/users/list",
    );

    mock.navigate("http://localhost/old#part");
    await settle();

    expect(paths(mock)).toStrictEqual(["/users/list", "/users/list#part"]);
    expect(started.getState()?.context.url?.hash).toBe("part");
  });

  it("control: a link to another route with a fragment is not a fragment-only navigation", async () => {
    const [kase] = CASES;
    const seen: NavigationOptions[] = [];
    const mock = new MockNavigation("http://localhost/home");

    router = createRouter(kase.routes, { defaultRoute: "home" });
    router.usePlugin(
      navigationPluginFactory({}, createMockNavigationBrowser(mock)),
      () => ({
        onTransitionSuccess: (_toState, _fromState, options) => {
          seen.push(options);
        },
      }),
    );
    await router.start();
    seen.length = 0;
    mock.navigate("http://localhost/users/list#part");
    await settle();

    expect(router.getState()?.context.url?.hash).toBe("part");
    expect(seen).toHaveLength(1);
    expect(seen[0].hashChange).toBeUndefined();
  });

  it("control: a fragment that changes on the router's own URL starts no transition", async () => {
    const [kase] = CASES;
    const { router: started, mock } = await start(
      kase.routes,
      kase.options,
      "http://localhost/users/list",
    );
    let transitions = 0;

    started.replaceHistoryState("users.list", {}, undefined, { hash: "x" });
    started.subscribe(() => {
      transitions++;
    });
    mock.navigate("http://localhost/users/list#x");
    await settle();

    expect(transitions).toBe(0);
    expect(paths(mock)).toStrictEqual(["/users/list#x"]);
  });

  it("an alias without a fragment clears the one the router published", async () => {
    const [kase] = CASES;
    const { router: started, mock } = await start(
      kase.routes,
      kase.options,
      "http://localhost/users/list#part",
    );

    mock.navigate("http://localhost/old");
    await settle();

    expect(paths(mock)).toStrictEqual(["/users/list#part", "/users/list"]);
    expect(started.getState()?.context.url?.hash).toBe("");
  });

  it("a newer navigation owns the URL: the alias an older one committed is not written", async () => {
    const [kase] = CASES;
    const { router: started, mock } = await start(
      kase.routes,
      kase.options,
      "http://localhost/users/list",
    );

    // The newer navigation is still running when the older one settles.
    getLifecycleApi(started).addActivateGuard(
      "home",
      () => () =>
        new Promise<boolean>((resolve) => {
          setTimeout(() => {
            resolve(true);
          }, 0);
        }),
    );
    mock.navigate("http://localhost/old");
    mock.navigate("http://localhost/home");
    await settle();

    expect(started.getState()?.name).toBe("home");
    expect(mock.currentUrl).toBe("http://localhost/home");
  });

  it("a newer navigation keeps its record: one refused after it returns to the router's entry", async () => {
    const [kase] = CASES;
    const { router: started, mock } = await start(
      [...kase.routes, { name: "locked", path: "/locked" }],
      kase.options,
      "http://localhost/users/list",
    );
    const lifecycle = getLifecycleApi(started);

    lifecycle.addActivateGuard(
      "home",
      () => () =>
        new Promise<boolean>((resolve) => {
          setTimeout(() => {
            resolve(true);
          }, 50);
        }),
    );
    lifecycle.addActivateGuard("locked", () => () => false);
    mock.navigate("http://localhost/old");
    mock.navigate("http://localhost/home");
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    mock.navigate("http://localhost/locked");
    await settle();

    expect(started.getState()?.name).toBe("users.list");
    expect(mock.currentUrl).toBe("http://localhost/users/list");
  });
});
