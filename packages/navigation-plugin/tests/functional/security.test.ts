import { createRouter } from "@real-router/core";
import { describe, expect, it, vi } from "vitest";

import { urlToPath } from "../../src/browser-env";
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

    // eslint-disable-next-line sonarjs/no-clear-text-protocols -- testing cross-origin filtering requires http
    mock.navigate("http://external.com/page");

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(withoutMeta(router.getState()!)).toStrictEqual(stateBefore);
  });
});

describe("Protocol Handling", () => {
  // Post-desktop-support: urlToPath is scheme-agnostic. Security against
  // malicious URLs comes from route matching (unknown paths return undefined
  // state), not from scheme filtering. See issue #496.

  it("urlToPath extracts path from ftp:// URLs (routing will match or miss)", () => {
    expect(urlToPath("ftp://files.example.com/doc", "")).toBe("/doc");
  });

  it("urlToPath treats javascript: as literal pathname (no route will match)", () => {
    expect(urlToPath("javascript:alert(1)", "")).toBe("/javascript:alert(1)");
  });

  it("urlToPath treats data: as literal pathname (no route will match)", () => {
    expect(urlToPath("data:text/html,<h1>hi</h1>", "")).toBe(
      "/data:text/html,<h1>hi</h1>",
    );
  });

  it("urlToPath accepts http:// protocol", () => {
    expect(urlToPath("http://localhost/users", "")).toBe("/users");
  });

  it("urlToPath accepts https:// protocol", () => {
    expect(urlToPath("https://example.com/users", "")).toBe("/users");
  });

  it("urlToPath accepts Tauri/Electron custom schemes", () => {
    expect(urlToPath("tauri://localhost/users", "")).toBe("/users");
    expect(urlToPath("app://myapp/home", "")).toBe("/home");
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
    // browser history. If `isSyncingFromRouter` were not set during the
    // internal `browser.navigate({ history: "replace" })`, the navigate event
    // would fire, the handler would re-enter router.navigate, and the state
    // would change.
    expect(navigateSpy).not.toHaveBeenCalled();
    expect(withoutMeta(router.getState()!)).toStrictEqual(stateBefore);
  });
});
