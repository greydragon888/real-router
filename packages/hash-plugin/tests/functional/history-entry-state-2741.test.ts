import { createRouter } from "@real-router/core";
import { afterEach, describe, expect, it } from "vitest";

import { hashPluginFactory } from "@real-router/hash-plugin";

import type { Router } from "@real-router/core";

/**
 * jsdom keeps the object `pushState` and `replaceState` are given, where a
 * browser stores a structured clone of it. These tests run on jsdom's own
 * history, with no cloning harness: an entry the plugin wrote must read back
 * the state it was written with after the plugin's next write.
 */
const routes = [
  { name: "home", path: "/home" },
  {
    name: "users",
    path: "/users",
    children: [{ name: "view", path: "/view/:id" }],
  },
];

const written = (): unknown => history.state;

const back = async (): Promise<void> => {
  const popped = new Promise<void>((resolve) => {
    globalThis.addEventListener(
      "popstate",
      () => {
        resolve();
      },
      { once: true },
    );
  });

  history.back();
  await popped;
};

let router: Router | undefined;

async function start(): Promise<Router> {
  history.replaceState(null, "", "/#/home");
  router = createRouter(routes, { defaultRoute: "home" });
  router.usePlugin(hashPluginFactory());
  await router.start();

  return router;
}

describe("an entry keeps the state the plugin wrote (#2741)", () => {
  afterEach(() => {
    router?.stop();
    router = undefined;
  });

  it("a transition's entry, read back after the next transition", async () => {
    const started = await start();

    await started.navigate("users.view", { id: "42" });
    started.stop();
    await back();

    expect(location.hash).toBe("#/home");
    expect(written()).toMatchObject({ name: "home", params: {} });
  });

  it("an entry replaceHistoryState wrote, read back after a later one", async () => {
    const started = await start();

    started.replaceHistoryState("home");
    await started.navigate("users.view", { id: "42" });
    started.replaceHistoryState("users.view", { id: "7" });
    started.stop();
    await back();

    expect(location.hash).toBe("#/home");
    expect(written()).toMatchObject({ name: "home", params: {} });
  });
});
