import { createRouter, errorCodes, UNKNOWN_ROUTE } from "@real-router/core";
import { getLifecycleApi, getPluginApi } from "@real-router/core/api";
import { afterEach, describe, expect, it, vi } from "vitest";

import { navigationPluginFactory } from "../../src";
import { PLUGIN_SYNC_INFO } from "../../src/navigation-browser";
import {
  MockNavigation,
  MockNavigationPrecommitController,
} from "../helpers/mockNavigation";
import { REWRITTEN_URLS } from "../helpers/rewrittenUrls";
import { createMockNavigationBrowser } from "../helpers/testUtils";

import type { RewrittenUrl } from "../helpers/rewrittenUrls";
import type { Router } from "@real-router/core";

const ORIGIN = "http://localhost";

const about = { name: "about", path: "/about" };

const settle = async (): Promise<void> => {
  for (let i = 0; i < 6; i++) {
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  }
};

const paths = (mock: MockNavigation): string[] =>
  mock.entries().map((entry) => {
    const url = new URL(entry.url);

    return url.pathname + url.search + url.hash;
  });

const routers: Router[] = [];

function newMock(at: string, precommit = true): MockNavigation {
  const mock = new MockNavigation(`${ORIGIN}${at}`);

  if (!precommit) {
    mock.disablePrecommit();
  }

  return mock;
}

async function start(
  kase: RewrittenUrl,
  mock: MockNavigation,
): Promise<Router> {
  const router = createRouter(kase.routes, {
    defaultRoute: "home",
    allowNotFound: true,
    ...kase.options,
  });

  routers.push(router);
  router.usePlugin(
    navigationPluginFactory({}, createMockNavigationBrowser(mock)),
  );
  await router.start();

  return router;
}

/** The scrolls the browser applies for one navigation from a router on `at`. */
async function scrollsAfter(
  kase: RewrittenUrl,
  at: string,
  navigate: (mock: MockNavigation) => unknown,
  precommit = true,
): Promise<readonly string[]> {
  const mock = newMock(at, precommit);

  await start(kase, mock);
  navigate(mock);
  await settle();

  return mock.scrolls;
}

/**
 * A history whose entry at `href` the plugin did not write: the one before the
 * page the router starts on.
 */
async function scrollsAfterBack(
  kase: RewrittenUrl,
  href: string,
  startOn: string,
  precommit = true,
): Promise<readonly string[]> {
  const mock = newMock(href, precommit);

  mock.historyPushState(`${ORIGIN}${startOn}`);
  await start(kase, mock);
  mock.back();
  await settle();

  return mock.scrolls;
}

/** URLs of the navigations the plugin itself starts to write the URL. */
function pluginWrites(mock: MockNavigation): string[] {
  const writes: string[] = [];

  mock.addEventListener("navigate", (event: NavigateEvent) => {
    if (
      event.info === PLUGIN_SYNC_INFO &&
      event.navigationType !== "traverse"
    ) {
      writes.push(event.destination.url);
    }
  });

  return writes;
}

function stopRouters(): void {
  for (const router of routers) {
    router.stop();
  }

  routers.length = 0;
  vi.restoreAllMocks();
}

/**
 * A navigation to a URL the router rewrites gets the scroll a navigation to
 * the router's URL gets: the browser applies it once, at the router's URL
 * (#2751). With precommit handlers a navigation that leaves the document is
 * redirected and never interrupted; without them, and on any other navigation,
 * the plugin's write interrupts it and the plugin asks for the scroll.
 * `mock.scrolls` records where a scroll happens, not the position a traversal
 * restores — that differs between engines (packages/navigation-plugin/CLAUDE.md).
 */
describe.each([
  { precommit: true, browser: "with precommit handlers" },
  { precommit: false, browser: "without precommit handlers" },
])(
  "a navigation the browser starts to a URL the router rewrites gets the scroll one to the router's URL gets, $browser (#2751)",
  ({ precommit }) => {
    afterEach(stopRouters);

    it.each(REWRITTEN_URLS)(
      "$name: a link is redirected before its commit only with precommit handlers",
      async (kase) => {
        const mock = newMock("/home", precommit);

        await start(kase, mock);

        const events: NavigateEvent[] = [];

        mock.addEventListener("navigate", (event: NavigateEvent) => {
          events.push(event);
        });

        const entry = await mock.navigate(`${ORIGIN}${kase.href}`).committed;

        await settle();

        // Without precommit handlers the browser commits the URL it was given,
        // and the plugin's write after the transition aborts the navigation.
        expect(entry.url).toBe(
          `${ORIGIN}${precommit ? kase.landsOn : kase.href}`,
        );
        expect(events.map((event) => event.signal.aborted)).toStrictEqual(
          precommit ? [false] : [true, false],
        );
      },
    );

    it.each(REWRITTEN_URLS)("$name: a link", async (kase) => {
      const canonical = await scrollsAfter(
        kase,
        "/home",
        (mock) => mock.navigate(`${ORIGIN}${kase.landsOn}`),
        precommit,
      );
      const rewritten = await scrollsAfter(
        kase,
        "/home",
        (mock) => mock.navigate(`${ORIGIN}${kase.href}`),
        precommit,
      );

      expect(canonical).toStrictEqual([`${ORIGIN}${kase.landsOn}`]);
      expect(rewritten).toStrictEqual(canonical);
    });

    it.each(REWRITTEN_URLS)("$name: a link with a fragment", async (kase) => {
      const canonical = await scrollsAfter(
        kase,
        "/home",
        (mock) => mock.navigate(`${ORIGIN}${kase.landsOn}#part`),
        precommit,
      );
      const rewritten = await scrollsAfter(
        kase,
        "/home",
        (mock) => mock.navigate(`${ORIGIN}${kase.href}#part`),
        precommit,
      );

      expect(canonical).toStrictEqual([`${ORIGIN}${kase.landsOn}#part`]);
      expect(rewritten).toStrictEqual(canonical);
    });

    it.each(REWRITTEN_URLS)("$name: a replace", async (kase) => {
      const canonical = await scrollsAfter(
        kase,
        "/home",
        (mock) =>
          mock.navigate(`${ORIGIN}${kase.landsOn}`, { history: "replace" }),
        precommit,
      );
      const rewritten = await scrollsAfter(
        kase,
        "/home",
        (mock) =>
          mock.navigate(`${ORIGIN}${kase.href}`, { history: "replace" }),
        precommit,
      );

      expect(canonical).toStrictEqual([`${ORIGIN}${kase.landsOn}`]);
      expect(rewritten).toStrictEqual(canonical);
    });

    it.each(REWRITTEN_URLS)(
      "$name: a link on the route the router shows",
      async (kase) => {
        const canonical = await scrollsAfter(
          kase,
          kase.landsOn,
          (mock) => mock.navigate(`${ORIGIN}${kase.landsOn}`),
          precommit,
        );
        const rewritten = await scrollsAfter(
          kase,
          kase.landsOn,
          (mock) => mock.navigate(`${ORIGIN}${kase.href}`),
          precommit,
        );

        expect(canonical).toStrictEqual([`${ORIGIN}${kase.landsOn}`]);
        expect(rewritten).toStrictEqual(canonical);
      },
    );

    it.each(REWRITTEN_URLS)("$name: history.pushState()", async (kase) => {
      const canonical = await scrollsAfter(
        kase,
        "/home",
        (mock) => mock.historyPushState(`${ORIGIN}${kase.landsOn}`),
        precommit,
      );
      const rewritten = await scrollsAfter(
        kase,
        "/home",
        (mock) => mock.historyPushState(`${ORIGIN}${kase.href}`),
        precommit,
      );

      expect(canonical).toStrictEqual([`${ORIGIN}${kase.landsOn}`]);
      expect(rewritten).toStrictEqual(canonical);
    });

    it.each(REWRITTEN_URLS)("$name: history.replaceState()", async (kase) => {
      const canonical = await scrollsAfter(
        kase,
        "/home",
        (mock) => mock.historyReplaceState(`${ORIGIN}${kase.landsOn}`),
        precommit,
      );
      const rewritten = await scrollsAfter(
        kase,
        "/home",
        (mock) => mock.historyReplaceState(`${ORIGIN}${kase.href}`),
        precommit,
      );

      expect(canonical).toStrictEqual([`${ORIGIN}${kase.landsOn}`]);
      expect(rewritten).toStrictEqual(canonical);
    });

    it.each(REWRITTEN_URLS)("$name: Back onto such an entry", async (kase) => {
      const canonical = await scrollsAfterBack(
        kase,
        kase.landsOn,
        "/home",
        precommit,
      );
      const rewritten = await scrollsAfterBack(
        kase,
        kase.href,
        "/home",
        precommit,
      );

      expect(canonical).toStrictEqual([`${ORIGIN}${kase.landsOn}`]);
      expect(rewritten).toStrictEqual(canonical);
    });

    it.each(REWRITTEN_URLS)(
      "$name: Back onto such an entry of the route the router shows",
      async (kase) => {
        const canonical = await scrollsAfterBack(
          kase,
          kase.landsOn,
          kase.landsOn,
          precommit,
        );
        const rewritten = await scrollsAfterBack(
          kase,
          kase.href,
          kase.landsOn,
          precommit,
        );

        expect(canonical).toStrictEqual([`${ORIGIN}${kase.landsOn}`]);
        expect(rewritten).toStrictEqual(canonical);
      },
    );

    it("a write the app makes as the router lands keeps the browser's scroll", async () => {
      const [kase] = REWRITTEN_URLS;
      const mock = newMock("/home", precommit);
      const router = await start(kase, mock);

      // The app's write is a navigation, as the plugin's is: it aborts the
      // browser's, on a URL the router does not rewrite as well.
      router.subscribe(({ route }) => {
        router.replaceHistoryState(route.name, route.params);
      });
      mock.navigate(`${ORIGIN}${kase.landsOn}`);
      await settle();

      expect(mock.scrolls).toStrictEqual([`${ORIGIN}${kase.landsOn}`]);
    });

    it("a navigation to a URL no route matches publishes its own metadata", async () => {
      const [kase] = REWRITTEN_URLS;
      const mock = newMock("/home", precommit);
      const router = await start(kase, mock);

      mock.historyPushState(`${ORIGIN}/nowhere`);
      await settle();

      expect(router.getState()?.name).toBe(UNKNOWN_ROUTE);
      expect(router.getState()?.context.navigation).toMatchObject({
        navigationType: "push",
        direction: "forward",
      });
    });

    it("a write the app makes as the router lands on a URL no route matches keeps the browser's scroll", async () => {
      const [kase] = REWRITTEN_URLS;
      const mock = newMock("/home", precommit);
      const router = await start(kase, mock);

      router.subscribe(() => {
        router.replaceHistoryState("home");
      });
      mock.historyPushState(`${ORIGIN}/nowhere`);
      await settle();

      expect(router.getState()?.name).toBe(UNKNOWN_ROUTE);
      expect(mock.scrolls).toStrictEqual([`${ORIGIN}/home`]);
    });
  },
);

/**
 * A navigation that leaves the document commits the router's URL: the
 * plugin redirects it before the commit, so nothing rewrites the entry after
 * the transition and nothing interrupts the browser's navigation (#2751).
 */
describe("a navigation that leaves the document is redirected to the router's URL before its commit (#2751)", () => {
  afterEach(stopRouters);

  it.each(
    REWRITTEN_URLS.flatMap((kase) =>
      (["push", "replace"] as const).flatMap((history) =>
        ["", "#part"].map((fragment) => ({ ...kase, history, fragment })),
      ),
    ),
  )(
    "$name, $history, fragment $fragment: commits the router's URL, uninterrupted",
    async (cell) => {
      const mock = newMock("/home");

      await start(cell, mock);

      const events: NavigateEvent[] = [];

      mock.addEventListener("navigate", (event: NavigateEvent) => {
        events.push(event);
      });

      const { committed } = mock.navigate(
        `${ORIGIN}${cell.href}${cell.fragment}`,
        { history: cell.history },
      );
      const entry = await committed;

      await settle();

      expect(entry.url).toBe(`${ORIGIN}${cell.landsOn}${cell.fragment}`);
      expect(events).toHaveLength(1);
      expect(events[0].signal.aborted).toBe(false);
    },
  );

  it("the redirect keeps `base`", async () => {
    const [kase] = REWRITTEN_URLS;
    const mock = newMock("/app/home");
    const router = createRouter(kase.routes, { defaultRoute: "home" });

    routers.push(router);
    router.usePlugin(
      navigationPluginFactory(
        { base: "/app" },
        createMockNavigationBrowser(mock),
      ),
    );
    await router.start("/home");

    const { committed } = mock.navigate(`${ORIGIN}/app${kase.href}`);
    const entry = await committed;

    expect(entry.url).toBe(`${ORIGIN}/app${kase.landsOn}`);
  });

  it.each([
    { fragment: "#50%25off", url: "#50%25off", published: "50%off" },
    { fragment: "#a/b&c=d", url: "#a/b&c=d", published: "a/b&c=d" },
    { fragment: "#%23part", url: "#part", published: "part" },
    { fragment: "##", url: "", published: "" },
  ])(
    "the redirect carries fragment $fragment as the router publishes it, uninterrupted",
    async ({ fragment, url, published }) => {
      const [kase] = REWRITTEN_URLS;
      const mock = newMock("/home");
      const router = await start(kase, mock);
      const writes = pluginWrites(mock);
      const { committed } = mock.navigate(`${ORIGIN}${kase.href}${fragment}`);
      const entry = await committed;

      await settle();

      expect(entry.url).toBe(`${ORIGIN}${kase.landsOn}${url}`);
      expect(router.getState()?.context.url?.hash).toBe(published);
      expect(writes).toStrictEqual([]);
      expect(mock.scrolls).toStrictEqual([entry.url]);
    },
  );

  it("a link a newer navigation overtakes before its commit leaves no entry", async () => {
    const [kase] = REWRITTEN_URLS;
    const mock = newMock("/home");
    const router = await start(
      { ...kase, routes: [...kase.routes, about] },
      mock,
    );

    mock.navigate(`${ORIGIN}${kase.href}`);
    mock.navigate(`${ORIGIN}/about`);
    await settle();

    expect(router.getState()?.name).toBe("about");
    expect(paths(mock)).toStrictEqual(["/home", "/about"]);
  });

  it("a router navigation started before a redirected link commits publishes its own metadata", async () => {
    const [kase] = REWRITTEN_URLS;
    const mock = newMock("/home");
    const router = await start(
      { ...kase, routes: [...kase.routes, about] },
      mock,
    );

    mock.navigate(`${ORIGIN}${kase.href}`, { info: "the link's" });
    await router.navigate("about");
    await settle();

    const meta = router.getState()?.context.navigation;

    expect(router.getState()?.name).toBe("about");
    expect(meta?.navigationType).toBe("push");
    expect(meta?.info).toBeUndefined();
    expect(paths(mock)).toStrictEqual(["/home", "/about"]);
  });

  it("a link whose handler runs after a newer navigation aborted it leaves no metadata to the next transition", async () => {
    const [kase] = REWRITTEN_URLS;
    const mock = newMock("/home");
    const router = await start(
      { ...kase, routes: [...kase.routes, about] },
      mock,
    );

    // The mock runs a handler a microtask after the commit, so the router's
    // navigation aborts the link before its handler runs.
    mock.navigate(`${ORIGIN}${kase.landsOn}`, { info: "the link's" });
    await router.navigate("about");
    await settle();

    const home = await router.navigate("home");

    expect(home.context.navigation?.navigationType).toBe("push");
    expect(home.context.navigation?.info).toBeUndefined();
  });

  it("a redirected link whose handler finds the router stopped leaves no metadata to the next start", async () => {
    const [kase] = REWRITTEN_URLS;
    const mock = newMock("/home");
    const router = await start(kase, mock);

    mock.navigate(`${ORIGIN}${kase.href}`, { info: "the link's" });
    router.stop();
    await settle();
    await router.start("/home");

    expect(router.getState()?.context.navigation?.navigationType).toBeDefined();
    expect(router.getState()?.context.navigation?.info).toBeUndefined();
  });

  it("a download that cancels a redirected link before its commit leaves the browser where it was, unwritten", async () => {
    const [kase] = REWRITTEN_URLS;
    const mock = newMock("/home");
    const router = await start(kase, mock);
    const writes = pluginWrites(mock);

    mock.navigate(`${ORIGIN}${kase.href}`);
    mock.download(`${ORIGIN}/file.pdf`);
    await settle();

    expect(router.getState()?.name).toBe("home");
    expect(mock.currentUrl).toBe(`${ORIGIN}/home`);
    expect(mock.downloads).toStrictEqual([`${ORIGIN}/file.pdf`]);
    expect(writes).toStrictEqual([]);
  });

  it("a download that cancels a redirected link keeps a fragment the app wrote on the entry it never left", async () => {
    const [kase] = REWRITTEN_URLS;
    const mock = newMock("/home");
    const router = await start(kase, mock);

    router.replaceHistoryState("home", {}, undefined, { hash: "x" });

    const writes = pluginWrites(mock);

    mock.navigate(`${ORIGIN}${kase.href}`);
    mock.download(`${ORIGIN}/file.pdf`);
    await settle();

    expect(router.getState()?.name).toBe("home");
    expect(writes).toStrictEqual([]);
    expect(mock.currentUrl).toBe(`${ORIGIN}/home#x`);
  });

  it("a redirected link whose handler finds the router restarting leaves no metadata to its start", async () => {
    const [kase] = REWRITTEN_URLS;
    const mock = newMock("/home");
    const router = await start(kase, mock);

    getPluginApi(router).addInterceptor("start", async (next, path) => {
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });

      return next(path);
    });
    mock.navigate(`${ORIGIN}${kase.href}`, { info: "the link's" });
    router.stop();

    const started = router.start("/home");

    await settle();
    await started;

    expect(router.getState()?.name).toBe("home");
    expect(router.getState()?.context.navigation?.info).toBeUndefined();
  });

  it("a download that cancels a redirected link returns to the router's entry from the one a navigation the router never reached committed", async () => {
    const [kase] = REWRITTEN_URLS;
    const mock = newMock("/home");
    const router = await start(
      { ...kase, routes: [...kase.routes, about] },
      mock,
    );

    getLifecycleApi(router).addActivateGuard(
      "about",
      () => () =>
        new Promise<boolean>((resolve) => {
          setTimeout(() => {
            resolve(true);
          }, 0);
        }),
    );
    const writes = pluginWrites(mock);

    mock.navigate(`${ORIGIN}/about`);
    mock.navigate(`${ORIGIN}${kase.href}`);
    mock.download(`${ORIGIN}/file.pdf`);
    await settle();

    expect(router.getState()?.name).toBe("home");
    expect(mock.currentUrl).toBe(`${ORIGIN}/home`);
    // The return is a traversal: the entry it leaves stays ahead.
    expect(writes).toStrictEqual([]);
    expect(paths(mock)).toStrictEqual(["/home", "/about"]);
  });

  it("a download that cancels a redirected link leaves a not-found state's URL where the app left it", async () => {
    const [kase] = REWRITTEN_URLS;
    const mock = newMock("/home");
    const router = await start(kase, mock);

    // The URL stays /home.
    router.navigateToNotFound("/missing");

    const writes = pluginWrites(mock);

    mock.navigate(`${ORIGIN}${kase.href}`);
    mock.download(`${ORIGIN}/file.pdf`);
    await settle();

    expect(router.getState()?.name).toBe(UNKNOWN_ROUTE);
    expect(writes).toStrictEqual([]);
    expect(mock.currentUrl).toBe(`${ORIGIN}/home`);
  });

  it("a refused Back onto the entry the router stands on leaves a not-found state's URL where the app left it", async () => {
    const [kase] = REWRITTEN_URLS;
    const mock = newMock("/home");
    const router = await start(
      { ...kase, routes: [...kase.routes, about] },
      mock,
    );

    // The URL stays /home.
    router.navigateToNotFound("/missing");

    const writes = pluginWrites(mock);

    // The router never reaches /about, so it still stands on /home's entry.
    getLifecycleApi(router).addActivateGuard(
      "about",
      () => () => new Promise<boolean>(() => {}),
    );
    mock.navigate(`${ORIGIN}/about`);
    await settle();
    getLifecycleApi(router).addActivateGuard("home", () => () => false);
    mock.back();
    await settle();

    expect(router.getState()?.name).toBe(UNKNOWN_ROUTE);
    expect(mock.currentUrl).toBe(`${ORIGIN}/home`);
    expect(writes).toStrictEqual([]);
  });

  it("a custom browser whose entries carry no id still takes a refused link back to the router's entry", async () => {
    const [kase] = REWRITTEN_URLS;
    const mock = newMock("/home");
    const withoutId = (entry: NavigationHistoryEntry): NavigationHistoryEntry =>
      ({
        key: entry.key,
        url: entry.url,
        index: entry.index,
        getState: () => entry.getState(),
      }) as unknown as NavigationHistoryEntry;
    const browser = {
      ...createMockNavigationBrowser(mock),
      entries: () => mock.entries().map((entry) => withoutId(entry)),
    };

    Object.defineProperty(browser, "currentEntry", {
      get: () => (mock.currentEntry ? withoutId(mock.currentEntry) : null),
    });

    const router = createRouter(kase.routes, { defaultRoute: "home" });

    routers.push(router);
    router.usePlugin(navigationPluginFactory({}, browser));
    await router.start();
    getLifecycleApi(router).addActivateGuard("users.list", () => () => false);
    mock.navigate(`${ORIGIN}${kase.href}`);
    await settle();

    expect(router.getState()?.name).toBe("home");
    expect(mock.currentUrl).toBe(`${ORIGIN}/home`);
  });

  it("a custom browser whose entries keep their id across a replace still rewrites a refused replace", async () => {
    const [kase] = REWRITTEN_URLS;
    const mock = newMock("/home");
    const keyAsId = (entry: NavigationHistoryEntry): NavigationHistoryEntry =>
      ({
        id: entry.key,
        key: entry.key,
        url: entry.url,
        index: entry.index,
        getState: () => entry.getState(),
      }) as unknown as NavigationHistoryEntry;
    const browser = {
      ...createMockNavigationBrowser(mock),
      entries: () => mock.entries().map((entry) => keyAsId(entry)),
    };

    Object.defineProperty(browser, "currentEntry", {
      get: () => (mock.currentEntry ? keyAsId(mock.currentEntry) : null),
    });

    const router = createRouter([...kase.routes, about], {
      defaultRoute: "home",
    });

    routers.push(router);
    router.usePlugin(navigationPluginFactory({}, browser));
    await router.start();
    getLifecycleApi(router).addActivateGuard("about", () => () => false);
    mock.navigate(`${ORIGIN}/about`, { history: "replace" });
    await settle();

    expect(router.getState()?.name).toBe("home");
    expect(mock.currentUrl).toBe(`${ORIGIN}/home`);
  });

  it("a navigation the start route's guard makes to a URL the router rewrites supersedes the start", async () => {
    const [kase] = REWRITTEN_URLS;
    const mock = newMock("/home");
    const router = createRouter(kase.routes, {
      defaultRoute: "home",
      ...kase.options,
    });

    routers.push(router);
    router.usePlugin(
      navigationPluginFactory({}, createMockNavigationBrowser(mock)),
    );
    getLifecycleApi(router).addActivateGuard("home", () => () => {
      mock.navigate(`${ORIGIN}${kase.href}`);

      return false;
    });

    // The guard refuses, so start() rejects.
    await router.start().catch(() => {});
    await settle();

    expect(router.isActive()).toBe(true);
    expect(router.getState()?.path).toBe(kase.landsOn);
  });

  it("a link to a URL the router rewrites while the start waits on a guard supersedes it, with one scroll at the router's URL", async () => {
    const [kase] = REWRITTEN_URLS;
    const mock = newMock("/home");
    const router = createRouter(kase.routes, {
      defaultRoute: "home",
      ...kase.options,
    });
    let release: ((allowed: boolean) => void) | undefined;

    routers.push(router);
    router.usePlugin(
      navigationPluginFactory({}, createMockNavigationBrowser(mock)),
    );
    getLifecycleApi(router).addActivateGuard(
      "home",
      () => () =>
        new Promise<boolean>((resolve) => {
          release = resolve;
        }),
    );

    const started = router.start().catch((error: unknown) => error);

    await settle();
    mock.navigate(`${ORIGIN}${kase.href}`);
    await settle();
    release?.(true);

    await expect(started).resolves.toMatchObject({
      code: errorCodes.TRANSITION_CANCELLED,
    });
    expect(router.getState()?.path).toBe(kase.landsOn);
    expect(mock.scrolls).toStrictEqual([`${ORIGIN}${kase.landsOn}`]);
  });

  it("a recovery puts back the published fragment a failed replace on the router's path changed", async () => {
    const [kase] = REWRITTEN_URLS;
    const mock = newMock("/home#a");
    const router = await start(kase, mock);

    vi.spyOn(console, "error").mockImplementation(() => {});
    router.subscribeLeave(() => {
      throw new TypeError("crash");
    });

    const { finished } = mock.navigate(`${ORIGIN}/home#b`, {
      history: "replace",
    });

    await expect(finished).rejects.toThrow("crash");

    expect(router.getState()?.context.url?.hash).toBe("a");
    expect(mock.currentUrl).toBe(`${ORIGIN}/home#a`);
  });

  it("control: a link to the router's own URL commits before the call returns", async () => {
    const [kase] = REWRITTEN_URLS;
    const mock = newMock("/home");

    await start(kase, mock);
    mock.navigate(`${ORIGIN}${kase.landsOn}`);

    expect(mock.currentUrl).toBe(`${ORIGIN}${kase.landsOn}`);
    expect(mock.crossDocumentNavigations).toStrictEqual([]);
  });

  it("control: a link to the router's own URL with a fragment commits before the call returns", async () => {
    const [kase] = REWRITTEN_URLS;
    const mock = newMock("/home");

    await start(kase, mock);
    mock.navigate(`${ORIGIN}${kase.landsOn}#part`);

    expect(mock.currentUrl).toBe(`${ORIGIN}${kase.landsOn}#part`);
    expect(mock.crossDocumentNavigations).toStrictEqual([]);
  });

  it.each(["historyPushState", "historyReplaceState"] as const)(
    "control: %s() still changes the URL before it returns",
    async (method) => {
      const [kase] = REWRITTEN_URLS;
      const mock = newMock("/home");

      await start(kase, mock);
      mock[method](`${ORIGIN}${kase.href}`);

      expect(mock.currentUrl).toBe(`${ORIGIN}${kase.href}`);

      await settle();

      expect(mock.currentUrl).toBe(`${ORIGIN}${kase.landsOn}`);
    },
  );

  it("a redirect the browser refuses leaves the navigation to the write after the transition", async () => {
    const [kase] = REWRITTEN_URLS;
    const mock = newMock("/home");
    const router = await start(kase, mock);
    const redirect = vi
      .spyOn(MockNavigationPrecommitController.prototype, "redirect")
      .mockImplementation(() => {
        throw new DOMException("refused", "SecurityError");
      });
    const events: NavigateEvent[] = [];

    mock.addEventListener("navigate", (event: NavigateEvent) => {
      events.push(event);
    });
    mock.navigate(`${ORIGIN}${kase.href}`);
    await settle();

    expect(redirect).toHaveBeenCalledTimes(1);
    expect(router.getState()?.path).toBe(kase.landsOn);
    expect(paths(mock)).toStrictEqual(["/home", kase.landsOn]);
    expect(events).toHaveLength(2);
    expect(events[0].signal.aborted).toBe(true);
    expect(mock.scrolls).toStrictEqual([`${ORIGIN}${kase.landsOn}`]);
  });
});

describe("the scroll stays the browser's where the plugin interrupted nothing (#2751)", () => {
  afterEach(stopRouters);

  it("control: a navigation the router refuses gets no scroll, and its entry carries the router's URL", async () => {
    const [kase] = REWRITTEN_URLS;
    const mock = newMock("/home");
    const router = await start(kase, mock);

    getLifecycleApi(router).addActivateGuard("users.list", () => () => false);
    mock.navigate(`${ORIGIN}${kase.href}`);
    await settle();

    expect(router.getState()?.name).toBe("home");
    expect(mock.currentUrl).toBe(`${ORIGIN}/home`);
    expect(paths(mock)).toStrictEqual(["/home", kase.landsOn]);
    expect(mock.scrolls).toStrictEqual([]);
  });

  it("control: a navigation a newer one cancels gets no scroll, the newer one does", async () => {
    const [kase] = REWRITTEN_URLS;
    const mock = newMock("/home");
    const router = await start(
      { ...kase, routes: [...kase.routes, about] },
      mock,
    );

    getLifecycleApi(router).addActivateGuard(
      "users.list",
      () => () =>
        new Promise<boolean>((resolve) => {
          setTimeout(() => {
            resolve(true);
          }, 50);
        }),
    );
    mock.navigate(`${ORIGIN}${kase.href}`);
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    mock.navigate(`${ORIGIN}/about`);
    await settle();

    expect(router.getState()?.name).toBe("about");
    expect(mock.scrolls).toStrictEqual([`${ORIGIN}/about`]);
  });

  it("control: an alias of the shown route a newer navigation overtakes gets no scroll, the newer one does", async () => {
    const [kase] = REWRITTEN_URLS;
    const mock = newMock(kase.landsOn);
    const router = await start(
      { ...kase, routes: [...kase.routes, about] },
      mock,
    );

    // `history.pushState()` commits the alias at once: the router answers
    // `SAME_STATES` after the newer navigation has aborted it.
    mock.historyPushState(`${ORIGIN}${kase.href}`);
    mock.navigate(`${ORIGIN}/about`);
    await settle();

    expect(router.getState()?.name).toBe("about");
    expect(mock.scrolls).toStrictEqual([`${ORIGIN}/about`]);
  });

  it("control: a navigation to a URL no route matches that a newer one overtakes gets no scroll, the newer one does", async () => {
    const [kase] = REWRITTEN_URLS;
    const mock = newMock("/home");
    const router = await start(
      { ...kase, routes: [...kase.routes, about] },
      mock,
    );

    mock.historyPushState(`${ORIGIN}/nowhere`);
    mock.navigate(`${ORIGIN}/about`);
    await settle();

    expect(router.getState()?.name).toBe("about");
    expect(mock.scrolls).toStrictEqual([`${ORIGIN}/about`]);
  });

  it("control: a navigation to a URL no route matches that a download overtakes publishes its own metadata and gets no scroll", async () => {
    const [kase] = REWRITTEN_URLS;
    const mock = newMock("/home");
    const router = await start(kase, mock);

    mock.historyPushState(`${ORIGIN}/nowhere`);
    mock.download(`${ORIGIN}/file.pdf`);
    await settle();

    expect(router.getState()?.name).toBe(UNKNOWN_ROUTE);
    expect(router.getState()?.context.navigation).toMatchObject({
      navigationType: "push",
      direction: "forward",
    });
    expect(mock.scrolls).toStrictEqual([]);
  });

  it("control: a link to the shown route's URL with an empty query is not interrupted", async () => {
    const [kase] = REWRITTEN_URLS;
    const mock = newMock("/home");

    await start(kase, mock);

    const events: NavigateEvent[] = [];

    mock.addEventListener("navigate", (event: NavigateEvent) => {
      events.push(event);
    });
    // `<a href="?">`, a GET form with no fields: SAME_STATES.
    mock.navigate(`${ORIGIN}/home?`);
    await settle();

    expect(events).toHaveLength(1);
    expect(events[0].signal.aborted).toBe(false);
    expect(mock.scrolls).toStrictEqual([`${ORIGIN}/home?`]);
  });

  it.each(REWRITTEN_URLS)(
    '$name: an app\'s `scroll: "manual"` keeps the scroll its own',
    async (kase) => {
      const mock = newMock("/home");

      await start(kase, mock);
      mock.addEventListener("navigate", (event: NavigateEvent) => {
        event.intercept({ scroll: "manual" });
      });
      mock.navigate(`${ORIGIN}${kase.href}`);
      await settle();

      expect(mock.currentUrl).toBe(`${ORIGIN}${kase.landsOn}`);
      expect(mock.scrolls).toStrictEqual([]);
    },
  );
});

describe("MockNavigation follows the browsers measured for #2751: scrolls, precommit handlers, entries, aborts", () => {
  it("an explicit `scroll()` replaces the scroll after the handlers, and a second one throws `InvalidStateError`", async () => {
    const mock = newMock("/home");
    let second: unknown;

    mock.addEventListener("navigate", (event: NavigateEvent) => {
      event.intercept({
        handler: () => {
          event.scroll();

          try {
            event.scroll();
          } catch (error) {
            second = error;
          }

          return Promise.resolve();
        },
      });
    });
    await mock.navigate(`${ORIGIN}/about`).finished;

    expect(second).toMatchObject({ name: "InvalidStateError" });
    expect(mock.scrolls).toStrictEqual([`${ORIGIN}/about`]);
  });

  it("a precommit handler that throws cancels the navigation: its signal aborts and the URL stays", async () => {
    const mock = newMock("/home");
    let signal: AbortSignal | undefined;

    mock.addEventListener("navigate", (event: NavigateEvent) => {
      signal = event.signal;
      event.intercept({
        precommitHandler: () => {
          throw new Error("refused");
        },
        handler: () => Promise.resolve(),
      });
    });

    const { committed, finished } = mock.navigate(`${ORIGIN}/about`);

    await expect(committed).rejects.toThrow("refused");
    await expect(finished).rejects.toThrow("refused");
    expect(signal?.aborted).toBe(true);
    expect(mock.currentUrl).toBe(`${ORIGIN}/home`);
  });

  it("`redirect()` to another origin throws `SecurityError`, and the navigation commits its own URL", async () => {
    const mock = newMock("/home");
    let thrown: unknown;

    mock.addEventListener("navigate", (event: NavigateEvent) => {
      event.intercept({
        precommitHandler: (controller) => {
          try {
            controller.redirect("https://other.test/x");
          } catch (error) {
            thrown = error;
          }
        },
        handler: () => Promise.resolve(),
      });
    });
    await mock.navigate(`${ORIGIN}/about`).finished;

    expect(thrown).toMatchObject({ name: "SecurityError" });
    expect(mock.currentUrl).toBe(`${ORIGIN}/about`);
  });

  it("a replace keeps the entry's key and gives it a new id", () => {
    const mock = newMock("/home");
    const before = mock.currentEntry;

    mock.historyReplaceState(`${ORIGIN}/about`);

    expect(mock.currentEntry?.key).toBe(before?.key);
    expect(mock.currentEntry?.id).not.toBe(before?.id);
  });

  it("a download aborts a navigation after an older one it overtook has finished", async () => {
    const mock = newMock("/home");
    const signals: AbortSignal[] = [];

    mock.addEventListener("navigate", (event: NavigateEvent) => {
      if (event.downloadRequest != null) {
        return;
      }

      const older = signals.length === 0;

      signals.push(event.signal);
      event.intercept({
        handler: () =>
          older ? Promise.resolve() : new Promise<undefined>(() => {}),
      });
    });
    mock.navigate(`${ORIGIN}/a`);
    mock.navigate(`${ORIGIN}/b`);
    await settle();
    mock.download(`${ORIGIN}/file.pdf`);

    expect(signals).toHaveLength(2);
    expect(signals[1].aborted).toBe(true);
  });

  it("a traversal, which cannot be cancelled, takes no precommit handler", () => {
    const mock = newMock("/home");
    let thrown: unknown;

    mock.historyPushState(`${ORIGIN}/about`);
    mock.addEventListener("navigate", (event: NavigateEvent) => {
      try {
        event.intercept({ precommitHandler: () => {} });
      } catch (error) {
        thrown = error;
      }
    });
    mock.back();

    expect(thrown).toMatchObject({ name: "InvalidStateError" });
  });
});
