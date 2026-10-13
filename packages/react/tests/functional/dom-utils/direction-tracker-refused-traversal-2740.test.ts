import { browserPluginFactory } from "@real-router/browser-plugin";
import { createRouter } from "@real-router/core";
import { getLifecycleApi, getPluginApi } from "@real-router/core/api";
import { afterEach, describe, expect, it } from "vitest";

import { createDirectionTracker } from "../../../src/dom-utils";

import type { Router } from "@real-router/core";

// jsdom's own history: a traversal fires `popstate` on a later task. jsdom
// keeps the object a write is given where a browser stores a clone, and the
// plugin copies what it writes (#2741).

// The traversal, the transition and the plugin's own return each take a task.
const settle = async (): Promise<void> => {
  for (let i = 0; i < 8; i++) {
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  }
};

let router: Router | undefined;

/** The tracker is installed before the plugin, as it documents. */
async function setup(): Promise<{ router: Router; destroy: () => void }> {
  globalThis.history.replaceState(null, "", "/");

  const created = createRouter(
    [
      { name: "home", path: "/" },
      { name: "about", path: "/about" },
      { name: "contact", path: "/contact" },
    ],
    { defaultRoute: "home" },
  );
  const tracker = createDirectionTracker(created);

  created.usePlugin(browserPluginFactory());
  await created.start();
  await created.navigate("about");
  router = created;

  return { router: created, destroy: tracker.destroy };
}

describe("createDirectionTracker beside a URL plugin that returns from a refused Back (#2740)", () => {
  afterEach(() => {
    router?.stop();
    router = undefined;
    delete document.documentElement.dataset.navDirection;
  });

  it("the plugin's return does not label the next navigation back", async () => {
    const { router: r, destroy } = await setup();
    let refusing = true;

    getLifecycleApi(r).addDeactivateGuard("about", () => () => !refusing);

    try {
      globalThis.history.back();
      await settle();

      // The plugin took the browser back to the page the router stayed on.
      expect(globalThis.location.pathname).toBe("/about");

      refusing = false;
      await r.navigate("contact");

      expect(document.documentElement.dataset.navDirection).toBe("forward");
    } finally {
      destroy();
    }
  });

  it("a return to an entry with a fragment is recognised too", async () => {
    const { router: r, destroy } = await setup();
    let refusing = true;

    await r.navigate("contact", {}, undefined, { hash: "team" });
    getLifecycleApi(r).addDeactivateGuard("contact", () => () => !refusing);

    try {
      globalThis.history.back();
      await settle();

      expect(globalThis.location.pathname + globalThis.location.hash).toBe(
        "/contact#team",
      );

      refusing = false;
      await r.navigate("home");

      expect(document.documentElement.dataset.navDirection).toBe("forward");
    } finally {
      destroy();
    }
  });

  it("a URL plugin whose buildUrl throws: every popstate arms the flag, as without one", async () => {
    const created = createRouter([
      { name: "home", path: "/" },
      { name: "about", path: "/about" },
    ]);
    const tracker = createDirectionTracker(created);
    const unextend = getPluginApi(created).extendRouter({
      buildUrl: () => {
        throw new Error("no URL");
      },
    });

    await created.start("/");
    router = created;

    try {
      globalThis.dispatchEvent(new PopStateEvent("popstate"));
      await created.navigate("about");

      expect(document.documentElement.dataset.navDirection).toBe("back");
    } finally {
      tracker.destroy();
      unextend();
    }
  });

  it("control: an allowed Back is labelled back", async () => {
    const { destroy } = await setup();

    try {
      globalThis.history.back();
      await settle();

      expect(globalThis.location.pathname).toBe("/");
      expect(document.documentElement.dataset.navDirection).toBe("back");
    } finally {
      destroy();
    }
  });
});
