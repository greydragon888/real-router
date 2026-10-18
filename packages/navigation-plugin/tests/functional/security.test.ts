import { createRouter } from "@real-router/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { navigationPluginFactory } from "../../src/factory";
import { MockNavigation } from "../helpers/mockNavigation";
import {
  createMockNavigationBrowser,
  routerConfig,
  withoutMeta,
} from "../helpers/testUtils";

describe("Cross-Origin Filtering", () => {
  it("navigate handler ignores events where canIntercept is false", async () => {
    const mock = new MockNavigation("http://localhost/home");
    const browser = createMockNavigationBrowser(mock);
    const router = createRouter(routerConfig);

    router.usePlugin(navigationPluginFactory({ base: "" }, browser));
    await router.start("/home");

    const stateBefore = withoutMeta(router.getState()!);
    const contextBefore = router.getState()!.context;

    // A path with a route, so only `canIntercept` keeps it from the router.
    mock.navigate("https://external.com/users/list");

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(withoutMeta(router.getState()!)).toStrictEqual(stateBefore);
    // context reference unchanged — no transition was triggered by the cross-origin event
    expect(router.getState()!.context).toBe(contextBefore);
  });
});

describe("Protocol Handling", () => {
  // urlToPath is scheme-agnostic (issue #496 — desktop `tauri://` / `app://` URL
  // support). Security against malicious URLs comes from route matching (unknown
  // paths resolve to `undefined` state), NOT from scheme filtering. Exercised
  // through the plugin's public `router.matchUrl()` rather than calling the pure
  // `urlToPath` helper directly (that is owned + unit-tested by the shared node).
  let router: ReturnType<typeof createRouter>;

  beforeEach(async () => {
    const mock = new MockNavigation("http://localhost/home");
    const browser = createMockNavigationBrowser(mock);

    router = createRouter(routerConfig);
    router.usePlugin(navigationPluginFactory({ base: "" }, browser));
    await router.start("/home");
  });

  it("accepts desktop tauri:// scheme — path extracted and matched", () => {
    expect(router.matchUrl("tauri://localhost/users/list")?.name).toBe(
      "users.list",
    );
  });

  it("accepts desktop app:// scheme — path extracted and matched", () => {
    expect(router.matchUrl("app://myapp/home")?.name).toBe("home");
  });

  it("accepts https:// scheme — path extracted and matched", () => {
    expect(router.matchUrl("https://example.com/users/list")?.name).toBe(
      "users.list",
    );
  });

  it("javascript: URL yields a non-matching path → undefined (route matching is the filter)", () => {
    expect(router.matchUrl("javascript:alert(1)")).toBeUndefined();
  });

  it("data: URL yields a non-matching path → undefined (route matching is the filter)", () => {
    expect(router.matchUrl("data:text/html,<h1>hi</h1>")).toBeUndefined();
  });
});

describe("replaceHistoryState Validation", () => {
  it("throws when route name is not found", async () => {
    const mock = new MockNavigation("http://localhost/home");
    const browser = createMockNavigationBrowser(mock);
    const router = createRouter(routerConfig);

    router.usePlugin(navigationPluginFactory({ base: "" }, browser));
    await router.start("/home");

    expect(() => {
      router.replaceHistoryState("nonexistent.route");
    }).toThrow('Cannot replace state: route "nonexistent.route" is not found');
  });

  it("replaceHistoryState does not re-enter the router via the navigate-event loop", async () => {
    const mock = new MockNavigation("http://localhost/home");
    const browser = createMockNavigationBrowser(mock);
    const router = createRouter(routerConfig);

    router.usePlugin(navigationPluginFactory({ base: "" }, browser));
    await router.start("/home");

    const navigateSpy = vi.spyOn(router, "navigate");
    const stateBefore = withoutMeta(router.getState()!);

    router.replaceHistoryState("users.list");

    await new Promise((resolve) => setTimeout(resolve, 10));

    // The router state must be unchanged — replaceHistoryState only rewrites
    // browser history. The internal `browser.navigate({ history: "replace" })`
    // is tagged with PLUGIN_SYNC_INFO so the navigate-event handler
    // short-circuits the event it fires; without that, the handler would
    // re-enter router.navigate and the state would change.
    expect(navigateSpy).not.toHaveBeenCalled();
    expect(withoutMeta(router.getState()!)).toStrictEqual(stateBefore);
  });
});

// A splat that begins with "/" prints a router path that begins with "//",
// and a URL that begins with "//" names a host: `nav.navigate("//evil.com")`
// leaves the origin. The URL the plugin writes keeps the path a path.
describe("Same-origin URL writes", () => {
  const catchAllConfig = [...routerConfig, { name: "any", path: "/*rest" }];

  it("keeps a document opened at an encoded leading slash on its origin", async () => {
    const mock = new MockNavigation("http://localhost/%2Fevil.com");
    const browser = createMockNavigationBrowser(mock);
    const router = createRouter(catchAllConfig);

    router.usePlugin(navigationPluginFactory({ base: "" }, browser));
    await router.start();

    const url = new URL(mock.currentUrl);

    expect(url.origin).toBe("http://localhost");
    expect(url.pathname).toBe(router.getState()!.path);
  });

  it.each(["/evil.com", "//evil.com"])(
    "keeps router.navigate with splat %j on the origin",
    async (rest) => {
      const mock = new MockNavigation("http://localhost/home");
      const browser = createMockNavigationBrowser(mock);
      const router = createRouter(catchAllConfig);

      router.usePlugin(navigationPluginFactory({ base: "" }, browser));
      await router.start("/home");
      await router.navigate("any", { rest });

      const url = new URL(mock.currentUrl);

      expect(url.origin).toBe("http://localhost");
      expect(url.pathname).toBe(router.getState()!.path);
    },
  );

  it("prints a link href on the origin", async () => {
    const mock = new MockNavigation("http://localhost/home");
    const browser = createMockNavigationBrowser(mock);
    const router = createRouter(catchAllConfig);

    router.usePlugin(navigationPluginFactory({ base: "" }, browser));
    await router.start("/home");

    const href = router.buildUrl("any", { rest: "/evil.com" });

    expect(new URL(href, mock.currentUrl).origin).toBe("http://localhost");
  });
});
