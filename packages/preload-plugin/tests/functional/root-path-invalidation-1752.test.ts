import { createRouter } from "@real-router/core";
import { getPluginApi, getRoutesApi } from "@real-router/core/api";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { preloadPluginFactory } from "../../src";
import {
  createAnchor,
  fireMouseOver,
  setupMatchUrl,
  waitForTimer,
} from "../helpers/testUtils";

import type { Route } from "@real-router/core";

/**
 * A root change drops the href-keyed snapshots, like every other structural
 * mutation (#1752 gap A).
 *
 * `#stateCache` is keyed by `href`, and `#onTreeChanged`'s `default` branch
 * exists because "any structural mutation can restale a cached href" (#805).
 * `setRootPath` is the mutation that restales EVERY href at once — it moves the
 * whole tree — and it was the one that never reached that handler, because core
 * announced nothing. Core emits `op: "rootPath"` now and the `default` branch
 * absorbs it with no edit here, which is why this file adds a cell rather than
 * the plugin adding a branch.
 *
 * ⚠ The `add()` arm is the CONTROL and it is not decoration: an assertion that
 * the snapshot is gone passes on a plugin whose cache never filled, and this is
 * the arm that says the cache fills and the invalidation path works.
 */
const ROUTES: readonly Route[] = [
  { name: "home", path: "/" },
  { name: "a", path: "/a" },
];

const HREF = "http://localhost/a";

const boot = async (): Promise<ReturnType<typeof createRouter>> => {
  const router = createRouter([...ROUTES], { defaultRoute: "home" });

  setupMatchUrl(router);
  router.usePlugin(preloadPluginFactory({ delay: 0 }));

  await router.start("/");

  return router;
};

/** Fill `#stateCache` for `href` — the cache is written as soon as the URL matches. */
const cacheHref = async (href: string): Promise<void> => {
  const anchor = createAnchor(href);

  fireMouseOver(anchor);
  await waitForTimer(30);
  anchor.remove();
};

const preloaded = (router: ReturnType<typeof createRouter>): boolean =>
  (
    router as { getPreloadedState?: (href: string) => unknown }
  ).getPreloadedState?.(HREF) !== undefined;

describe("a root change invalidates the href cache (#1752)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.useRealTimers();
  });

  it("CONTROL — add() fills the cache and drops it", async () => {
    const router = await boot();

    await cacheHref(HREF);

    expect(preloaded(router)).toBe(true);

    // `getPreloadedState` is delete-on-read, so re-fill before the mutation.
    await cacheHref(HREF);
    getRoutesApi(router).add([{ name: "c", path: "/c" }]);

    expect(preloaded(router)).toBe(false);

    router.dispose();
  });

  it("setRootPath drops it too — the snapshot's URL now matches nothing", async () => {
    const router = await boot();

    await cacheHref(HREF);
    getPluginApi(router).setRootPath("/app");

    expect(preloaded(router)).toBe(false);
    // What the snapshot would have claimed, had it survived.
    expect(router.buildPath("a")).toBe("/app/a");
    expect(getPluginApi(router).matchPath("/a")).toBeUndefined();

    router.dispose();
  });
});
