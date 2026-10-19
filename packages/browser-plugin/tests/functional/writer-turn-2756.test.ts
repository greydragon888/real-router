import { createRouter } from "@real-router/core";
import { afterEach, describe, expect, it } from "vitest";

import { browserPluginFactory } from "@real-router/browser-plugin";

import type { PluginFactory, Router, State } from "@real-router/core";

/**
 * The plugin writes the history entry and its context namespaces in its own
 * `onTransitionSuccess`, at its place among the listeners of that event: a
 * listener registered after it reads both, one registered before it reads
 * neither. The wiki states this as the rule "Order Between Plugins: Writers
 * Before Readers" (plugin-architecture). Runs on jsdom's own history.
 */
const routes = [
  { name: "list", path: "/list" },
  { name: "item", path: "/item/:id" },
];

interface Seen {
  to: string;
  location: string;
  namespaces: string[];
}

const seenAt = (toState: State): Seen => ({
  to: toState.path,
  location: location.pathname,
  namespaces: Object.keys(toState.context).toSorted((a, b) =>
    a.localeCompare(b),
  ),
});

const observer =
  (seen: Seen[]): PluginFactory =>
  () => ({
    onTransitionSuccess: (toState) => {
      seen.push(seenAt(toState));
    },
  });

let router: Router | undefined;

async function navigateToItem(
  register: (router: Router, seen: Seen[]) => void,
): Promise<Seen[]> {
  history.replaceState(null, "", "/list");
  router = createRouter(routes, { defaultRoute: "list" });

  const seen: Seen[] = [];

  register(router, seen);
  await router.start();
  seen.length = 0;
  await router.navigate("item", { id: "16" });

  return seen;
}

describe("browser-plugin writes at its own turn among the success listeners", () => {
  afterEach(() => {
    router?.stop();
    router = undefined;
  });

  it("a plugin registered after it reads the new entry and both namespaces", async () => {
    const seen = await navigateToItem((router, seen) => {
      router.usePlugin(browserPluginFactory(), observer(seen));
    });

    expect(seen).toStrictEqual([
      { to: "/item/16", location: "/item/16", namespaces: ["browser", "url"] },
    ]);
  });

  it("a plugin registered before it reads the previous entry and neither namespace", async () => {
    const seen = await navigateToItem((router, seen) => {
      router.usePlugin(observer(seen), browserPluginFactory());
    });

    expect(seen).toStrictEqual([
      { to: "/item/16", location: "/list", namespaces: [] },
    ]);
  });

  it("a subscriber registered before usePlugin reads what an earlier plugin reads", async () => {
    const seen = await navigateToItem((router, seen) => {
      router.subscribe(({ route }) => {
        seen.push(seenAt(route));
      });
      router.usePlugin(browserPluginFactory());
    });

    expect(seen).toStrictEqual([
      { to: "/item/16", location: "/list", namespaces: [] },
    ]);
  });
});
