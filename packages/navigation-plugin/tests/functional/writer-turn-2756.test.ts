import { createRouter } from "@real-router/core";
import { afterEach, describe, expect, it } from "vitest";

import { navigationPluginFactory } from "../../src";
import { MockNavigation } from "../helpers/mockNavigation";
import { createMockNavigationBrowser } from "../helpers/testUtils";

import type { PluginFactory, Router } from "@real-router/core";

/**
 * On a navigation the router starts, the plugin writes the history entry and
 * its context namespaces in its own `onTransitionSuccess`, at its place among
 * the listeners of that event: a listener registered after it reads both, one
 * registered before it reads neither. The wiki states this as the rule "Order
 * Between Plugins: Writers Before Readers" (plugin-architecture).
 */
const routes = [
  { name: "list", path: "/list" },
  { name: "item", path: "/item/:id" },
];

interface Seen {
  to: string;
  entry: string;
  namespaces: string[];
}

let router: Router | undefined;

async function navigateToItem(
  register: (
    router: Router,
    plugin: PluginFactory,
    observer: PluginFactory,
  ) => void,
): Promise<Seen[]> {
  const mockNav = new MockNavigation("http://localhost/list");
  const seen: Seen[] = [];
  const observer: PluginFactory = () => ({
    onTransitionSuccess: (toState) => {
      seen.push({
        to: toState.path,
        entry: new URL(mockNav.currentEntry?.url ?? "").pathname,
        namespaces: Object.keys(toState.context).toSorted((a, b) =>
          a.localeCompare(b),
        ),
      });
    },
  });

  router = createRouter(routes, { defaultRoute: "list" });
  register(
    router,
    navigationPluginFactory({}, createMockNavigationBrowser(mockNav)),
    observer,
  );
  await router.start();
  seen.length = 0;
  await router.navigate("item", { id: "16" });

  return seen;
}

describe("navigation-plugin writes at its own turn among the success listeners", () => {
  afterEach(() => {
    router?.stop();
    router = undefined;
  });

  it("a plugin registered after it reads the new entry and both namespaces", async () => {
    const seen = await navigateToItem((router, plugin, observer) => {
      router.usePlugin(plugin, observer);
    });

    expect(seen).toStrictEqual([
      { to: "/item/16", entry: "/item/16", namespaces: ["navigation", "url"] },
    ]);
  });

  it("a plugin registered before it reads the previous entry and neither namespace", async () => {
    const seen = await navigateToItem((router, plugin, observer) => {
      router.usePlugin(observer, plugin);
    });

    expect(seen).toStrictEqual([
      { to: "/item/16", entry: "/list", namespaces: [] },
    ]);
  });
});
