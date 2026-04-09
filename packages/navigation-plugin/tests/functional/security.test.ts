import { createRouter } from "@real-router/core";
import { urlToPath } from "browser-env";
import { describe, expect, it } from "vitest";

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

describe("Protocol Validation", () => {
  it("urlToPath rejects ftp:// protocol", () => {
    expect(urlToPath("ftp://files.example.com/doc", "", "test")).toBeNull();
  });

  it("urlToPath rejects javascript: protocol", () => {
    expect(urlToPath("javascript:alert(1)", "", "test")).toBeNull();
  });

  it("urlToPath rejects data: protocol", () => {
    expect(urlToPath("data:text/html,<h1>hi</h1>", "", "test")).toBeNull();
  });

  it("urlToPath accepts http:// protocol", () => {
    const result = urlToPath("http://localhost/users", "", "test");

    expect(result).toBe("/users");
  });

  it("urlToPath accepts https:// protocol", () => {
    const result = urlToPath("https://example.com/users", "", "test");

    expect(result).toBe("/users");
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

  it("sets isSyncingFromRouter during replaceState", async () => {
    const mock = new MockNavigation("http://localhost/home");
    const browser = createMockNavigationBrowser(mock);
    const router = createRouter(routerConfig);

    router.usePlugin(navigationPluginFactory({ base: "" }, browser));
    await router.start("/home");

    const stateBefore = withoutMeta(router.getState()!);

    router.replaceHistoryState("users.list");

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(withoutMeta(router.getState()!)).toStrictEqual(stateBefore);
  });
});
