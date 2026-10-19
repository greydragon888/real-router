import { createRouter } from "@real-router/core";
import { afterEach, describe, expect, it } from "vitest";

import { memoryPluginFactory } from "@real-router/memory-plugin";

import type { PluginFactory, Router } from "@real-router/core";

/**
 * The plugin moves its stack and writes its context namespace in its own
 * `onTransitionSuccess`, at its place among the listeners of that event: a
 * listener registered after it reads both, one registered before it reads
 * neither. The wiki states this as the rule "Order Between Plugins: Writers
 * Before Readers" (plugin-architecture).
 */
const routes = [
  { name: "list", path: "/list" },
  { name: "item", path: "/item/:id" },
];

interface Seen {
  to: string;
  canGoBack: boolean;
  namespaces: string[];
}

let router: Router | undefined;

async function navigateToItem(
  register: (router: Router, observer: PluginFactory) => void,
): Promise<Seen[]> {
  const seen: Seen[] = [];
  const current = createRouter(routes, { defaultRoute: "list" });
  const observer: PluginFactory = () => ({
    onTransitionSuccess: (toState) => {
      seen.push({
        to: toState.path,
        canGoBack: current.canGoBack(),
        namespaces: Object.keys(toState.context).toSorted((a, b) =>
          a.localeCompare(b),
        ),
      });
    },
  });

  router = current;
  register(current, observer);
  await current.start("/list");
  seen.length = 0;
  await current.navigate("item", { id: "16" });

  return seen;
}

describe("memory-plugin writes at its own turn among the success listeners", () => {
  afterEach(() => {
    router?.stop();
    router = undefined;
  });

  it("a plugin registered after it reads the moved stack and its namespace", async () => {
    const seen = await navigateToItem((router, observer) => {
      router.usePlugin(memoryPluginFactory(), observer);
    });

    expect(seen).toStrictEqual([
      { to: "/item/16", canGoBack: true, namespaces: ["memory"] },
    ]);
  });

  it("a plugin registered before it reads the previous stack and no namespace", async () => {
    const seen = await navigateToItem((router, observer) => {
      router.usePlugin(observer, memoryPluginFactory());
    });

    expect(seen).toStrictEqual([
      { to: "/item/16", canGoBack: false, namespaces: [] },
    ]);
  });
});
