/**
 * `createScrollRestoration` under the real plugins that publish a step through
 * history (#2912).
 *
 * The cells in `scroll-restore.test.ts` hand the utility the context a plugin
 * writes. Here the plugin writes it, so a change to its namespace, to what a
 * traversal commits or to the state browser-plugin stamps into an entry shows
 * up as a failure. A cell runs the frames itself, after the traversal's
 * listeners have run, which is when a browser runs them.
 *
 * navigation-plugin is absent: it needs the Navigation API, which jsdom lacks.
 * hash-plugin is absent: it publishes no context namespace.
 */
import { browserPluginFactory } from "@real-router/browser-plugin";
import { createRouter } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";
import { memoryPluginFactory } from "@real-router/memory-plugin";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createScrollRestoration } from "../../../src/dom-utils";

import type { Router } from "@real-router/core";
import type { Mock } from "vitest";

const routes = [
  { name: "cars", path: "/cars?page" },
  { name: "car", path: "/cars/:id" },
];

// The real `sessionStorage` is not spyable under vitest + jsdom
// (IMPLEMENTATION_NOTES.md § "Adapter scroll tests mock `sessionStorage`").
function createMockStorage(): Storage {
  const store = new Map<string, string>();

  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    key(index: number) {
      return [...store.keys()][index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
  };
}

// Throws when the navigation a cell waits for never lands.
async function until(predicate: () => boolean): Promise<void> {
  for (let i = 0; i < 100; i++) {
    if (predicate()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 5));
  }

  throw new Error("the awaited navigation did not land");
}

// Runs the queued frames, and the frames they queue in turn.
function flush(frames: FrameRequestCallback[]): void {
  for (let i = 0; i < 20 && frames.length > 0; i++) {
    for (const cb of frames.splice(0)) {
      cb(0);
    }
  }
}

function contextOf(router: Router) {
  return router.getState()?.context;
}

describe("createScrollRestoration under the real history plugins (#2912)", () => {
  let y: number;
  let frames: FrameRequestCallback[];
  let router: Router;
  let sr: { destroy: () => void };
  let scrollTo: Mock<(opts: ScrollToOptions) => void>;

  beforeEach(() => {
    y = 0;
    frames = [];
    scrollTo = vi.fn((opts: ScrollToOptions) => {
      y = opts.top ?? 0;
    });
    vi.stubGlobal("sessionStorage", createMockStorage());
    vi.stubGlobal("scrollTo", scrollTo);
    vi.stubGlobal(
      "requestAnimationFrame",
      (cb: FrameRequestCallback): number => {
        frames.push(cb);

        return frames.length;
      },
    );
    Object.defineProperty(globalThis, "scrollY", {
      get: () => y,
      configurable: true,
    });
  });

  afterEach(() => {
    sr.destroy();
    router.stop();
    vi.unstubAllGlobals();
    Object.defineProperty(globalThis, "scrollY", {
      value: 0,
      configurable: true,
      writable: true,
    });
    history.scrollRestoration = "auto";
  });

  describe("browser-plugin", () => {
    beforeEach(async () => {
      history.replaceState(null, "", "/cars");
      router = createRouter(routes, { defaultRoute: "cars" });
      router.usePlugin(browserPluginFactory());
      await router.start();
      sr = createScrollRestoration(router, { mode: "restore" });
    });

    it("Back and Forward return to the position each location was left at", async () => {
      y = 2200;
      await router.navigate("car", { id: "x" });
      flush(frames);

      expect(y, "a push lands at the top").toBe(0);

      y = 700;
      history.back();
      await until(() => router.getState()?.name === "cars");
      flush(frames);

      expect(contextOf(router)?.browser?.source).toBe("popstate");
      expect(y).toBe(2200);

      history.forward();
      await until(() => router.getState()?.name === "car");
      flush(frames);

      expect(contextOf(router)?.browser?.source).toBe("popstate");
      expect(y).toBe(700);
    });

    it("a fragment navigation on the same route leaves the scroll to the browser", async () => {
      location.hash = "#part";
      await until(() => contextOf(router)?.url?.hash === "part");
      flush(frames);

      expect(contextOf(router)?.browser?.source).toBe("popstate");
      expect(scrollTo).not.toHaveBeenCalled();
    });

    it("a fragment navigation after a URL rewritten without a commit leaves the scroll too", async () => {
      router.replaceHistoryState("cars", {}, { page: "3" });
      location.hash = "#part";
      // The popstate moves the router's location, so only the new entry tells
      // this navigation from a traversal.
      await until(() => router.getState()?.path === "/cars?page=3");
      flush(frames);

      expect(contextOf(router)?.browser?.source).toBe("popstate");
      expect(scrollTo).not.toHaveBeenCalled();
    });

    it("Back from an anchor's entry onto the location it left keeps the scroll", async () => {
      location.hash = "#part";
      await until(() => contextOf(router)?.url?.hash === "part");
      flush(frames);
      // Where the browser's scroll to the fragment would leave the page.
      y = 3040;
      history.back();
      await until(() => contextOf(router)?.url?.hash === "");
      flush(frames);

      expect(contextOf(router)?.browser?.source).toBe("popstate");
      expect(scrollTo).not.toHaveBeenCalled();
    });

    it("Back onto the entry an in-page anchor pushed returns to its position", async () => {
      location.hash = "#part";
      await until(() => contextOf(router)?.url?.hash === "part");
      flush(frames);
      // Where the browser's scroll to the fragment would leave the page.
      y = 3040;
      await router.navigate("car", { id: "x" });
      flush(frames);

      expect(y, "a push lands at the top").toBe(0);

      history.back();
      await until(() => router.getState()?.name === "cars");
      flush(frames);

      // The plugin stamped the anchor's entry when it committed it, so the
      // popstate back onto it reads as a step through history.
      expect(contextOf(router)?.url?.hash).toBe("part");
      expect(y).toBe(3040);
    });

    // The plugin defers the second Back while the guard is pending and replays
    // it once the first commits, so both commit before a frame runs.
    it("two quick Backs across an anchor's entry, during the landing route's guard, restore its position", async () => {
      location.hash = "#part";
      await until(() => contextOf(router)?.url?.hash === "part");
      flush(frames);
      y = 3040;
      await router.navigate("car", { id: "x" });
      flush(frames);
      getLifecycleApi(router).addActivateGuard(
        "cars",
        () => () =>
          new Promise<boolean>((resolve) => {
            setTimeout(() => {
              resolve(true);
            }, 20);
          }),
      );
      y = 700;
      history.back();
      // On the anchor's entry, with its commit held by the guard.
      await until(() => location.pathname === "/cars");
      history.back();
      await until(
        () =>
          router.getState()?.name === "cars" &&
          contextOf(router)?.url?.hash === "",
      );
      flush(frames);

      expect(y).toBe(3040);
    });
  });

  describe("memory-plugin", () => {
    beforeEach(async () => {
      router = createRouter(routes, { defaultRoute: "cars" });
      router.usePlugin(memoryPluginFactory());
      await router.start("/cars");
      sr = createScrollRestoration(router, { mode: "restore" });
    });

    it("back() and forward() return to the position each location was left at", async () => {
      y = 2200;
      await router.navigate("car", { id: "x" });
      flush(frames);

      expect(y, "a push lands at the top").toBe(0);

      y = 700;
      router.back();
      await until(() => router.getState()?.name === "cars");
      flush(frames);

      expect(contextOf(router)?.memory?.direction).toBe("back");
      expect(y).toBe(2200);

      router.forward();
      await until(() => router.getState()?.name === "car");
      flush(frames);

      expect(contextOf(router)?.memory?.direction).toBe("forward");
      expect(y).toBe(700);
    });
  });
});
