import { createRouter } from "@real-router/core";
import { afterEach, describe, expect, it } from "vitest";

import { hashPluginFactory } from "@real-router/hash-plugin";

import type { PluginFactory, Router } from "@real-router/core";

/**
 * The plugin writes the history entry in its own `onTransitionSuccess`, at its
 * place among the listeners of that event: a listener registered after it
 * reads the new entry, one registered before it reads the previous one. The
 * wiki states this as the rule "Order Between Plugins: Writers Before Readers"
 * (plugin-architecture). Runs on jsdom's own history.
 */
const routes = [
  { name: "list", path: "/list" },
  { name: "item", path: "/item/:id" },
];

interface Seen {
  to: string;
  hash: string;
}

const observer =
  (seen: Seen[]): PluginFactory =>
  () => ({
    onTransitionSuccess: (toState) => {
      seen.push({ to: toState.path, hash: location.hash });
    },
  });

let router: Router | undefined;

async function navigateToItem(
  register: (router: Router, seen: Seen[]) => void,
): Promise<Seen[]> {
  history.replaceState(null, "", "/#/list");
  router = createRouter(routes, { defaultRoute: "list" });

  const seen: Seen[] = [];

  register(router, seen);
  await router.start();
  seen.length = 0;
  await router.navigate("item", { id: "16" });

  return seen;
}

describe("hash-plugin writes at its own turn among the success listeners", () => {
  afterEach(() => {
    router?.stop();
    router = undefined;
  });

  it("a plugin registered after it reads the new entry", async () => {
    const seen = await navigateToItem((router, seen) => {
      router.usePlugin(hashPluginFactory(), observer(seen));
    });

    expect(seen).toStrictEqual([{ to: "/item/16", hash: "#/item/16" }]);
  });

  it("a plugin registered before it reads the previous entry", async () => {
    const seen = await navigateToItem((router, seen) => {
      router.usePlugin(observer(seen), hashPluginFactory());
    });

    expect(seen).toStrictEqual([{ to: "/item/16", hash: "#/list" }]);
  });
});
