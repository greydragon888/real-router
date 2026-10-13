import { createRouter } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";
import { afterEach, describe, expect, it } from "vitest";

import { browserPluginFactory } from "@real-router/browser-plugin";

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

interface WrittenState {
  name: string;
  params: Record<string, string>;
  position: { run: string; index: number };
}

const written = (): WrittenState => history.state as WrittenState;

// The traversal, the transition and the plugin's own return each take a task.
const settle = async (): Promise<void> => {
  for (let i = 0; i < 8; i++) {
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  }
};

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
  history.replaceState(null, "", "/home");
  router = createRouter(routes, { defaultRoute: "home" });
  router.usePlugin(browserPluginFactory());
  await router.start("/home");

  return router;
}

describe("an entry keeps the state the plugin wrote (#2741)", () => {
  afterEach(() => {
    router?.stop();
    router = undefined;
  });

  it("a transition's entry, read back after the next transition", async () => {
    const started = await start();
    const first = written();

    await started.navigate("users.view", { id: "42" });
    const second = written();

    started.stop();
    await back();

    expect(written()).toMatchObject({ name: "home", params: {} });
    expect(written().position).toStrictEqual(first.position);
    expect(written().position.index).toBe(second.position.index - 1);
  });

  it("an entry replaceHistoryState wrote, read back after a later one", async () => {
    const started = await start();

    started.replaceHistoryState("home");
    await started.navigate("users.view", { id: "42" });
    started.replaceHistoryState("users.view", { id: "7" });
    started.stop();
    await back();

    expect(written()).toMatchObject({ name: "home", params: {} });
  });

  it("Back takes the router to the route of the entry it reaches", async () => {
    const started = await start();

    await started.navigate("users.view", { id: "42" });
    await back();
    await settle();

    expect(started.getState()?.name).toBe("home");
    expect(location.pathname).toBe("/home");
  });

  it("a Back canDeactivate refuses asks the guard and returns to the entry it left", async () => {
    const started = await start();
    let asked = 0;

    getLifecycleApi(started).addDeactivateGuard("users.view", () => () => {
      asked++;

      return false;
    });
    await started.navigate("users.view", { id: "42" });
    await back();
    await settle();

    expect(asked).toBe(1);
    expect(started.getState()?.name).toBe("users.view");
    expect(location.pathname).toBe("/users/view/42");
    expect(written()).toMatchObject({
      name: "users.view",
      params: { id: "42" },
    });
  });
});
