// #1922 (half 2) — a popstate queued behind an in-flight transition must not
// outlive the plugin that queued it.
//
// The `deferred` slot is filled when an event arrives mid-transition and
// emptied only by `processDeferredEvent`, which the in-flight transition's
// `finally` calls unconditionally. Neither lifecycle cleared the slot, so a
// queued event replayed after `stop()` / `teardown()`: the strict-mode branch
// wrote history directly (`rollbackUrlToCurrentState` is called by the handler,
// not by a hook), and a matched entry navigated a router the plugin no longer
// serves.
//
// The listener contract itself was never broken — every `addEventListener` has
// its `removeEventListener` on the same reference, which is why the
// listener-leak suites are green on this. What leaked is a queued EVENT.
//
// Half 1 of the issue — the rollback writing a whole `State` into
// `history.state` — is already closed by #1837 and pinned by
// `rollback-projection-1837.test.ts`, including the non-cloneable-context cell.
import { createRouter } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { browserPluginFactory } from "@real-router/browser-plugin";

import { createMockedBrowser, noop, routerConfig } from "../helpers/testUtils";

import type { Browser } from "../../src/browser-env";
import type { Router, Unsubscribe } from "@real-router/core";

/** The entry whose guard blocks, holding the transition open. */
const BLOCKING = {
  name: "users.view",
  params: { id: "1" },
  search: {},
  path: "/users/view/1",
};

/** Queued behind it, and matched — its replay navigates. */
const QUEUED_MATCHED = {
  name: "users.view",
  params: { id: "2" },
  search: {},
  path: "/users/view/2",
};

/**
 * Queued behind it, and NOT matched — its replay takes the strict-mode branch,
 * where the handler calls `rollbackUrlToCurrentState` itself.
 */
const QUEUED_UNMATCHED = {
  name: "gone",
  params: {},
  search: {},
  path: "/gone",
};

interface Outcome {
  /** Did `processDeferredEvent` replay the queued event at all? */
  replayed: boolean;
  /** History writes attributable to the replay. */
  writes: string[];
  path: string;
}

let router: Router;
let browser: Browser;
let unsubscribe: Unsubscribe | undefined;

async function run(
  interrupt: "none" | "stop" | "teardown",
  queued: typeof QUEUED_MATCHED | typeof QUEUED_UNMATCHED,
): Promise<Outcome> {
  const warnings: string[] = [];
  const writes: string[] = [];

  vi.spyOn(console, "warn").mockImplementation((...args: unknown[]) => {
    warnings.push(String(args[0]));
  });

  let releaseGuard: ((value: boolean) => void) | undefined;
  let guardCalls = 0;

  getLifecycleApi(router).addActivateGuard("users.view", () => () => {
    guardCalls += 1;

    // Block the FIRST activation only — the replay must be free to proceed,
    // otherwise it stalls on the guard and the cell measures nothing.
    if (guardCalls > 1) {
      return true;
    }

    return new Promise<boolean>((resolve) => {
      releaseGuard = resolve;
    });
  });

  globalThis.dispatchEvent(new PopStateEvent("popstate", { state: BLOCKING }));
  await Promise.resolve();
  globalThis.dispatchEvent(new PopStateEvent("popstate", { state: queued }));
  await Promise.resolve();

  if (interrupt === "stop") {
    router.stop();
  } else if (interrupt === "teardown") {
    unsubscribe?.();
    unsubscribe = undefined;
  }

  // Only writes from here on are attributable to the replay.
  browser.replaceState = (_state, url) => {
    writes.push(`replace:${url}`);
  };
  browser.pushState = (_state, url) => {
    writes.push(`push:${url}`);
  };

  warnings.length = 0;
  releaseGuard?.(true);
  await new Promise((resolve) => setTimeout(resolve, 10));

  return {
    replayed: warnings.some((line) => line.includes("Processing deferred")),
    writes,
    path: router.getState()?.path ?? "(stopped)",
  };
}

describe("#1922 — a deferred popstate does not outlive the plugin", () => {
  beforeAll(() => {
    vi.spyOn(console, "error").mockImplementation(noop);
  });

  beforeEach(async () => {
    browser = createMockedBrowser(noop);
    globalThis.history.replaceState({}, "", "/");
    router = createRouter(routerConfig, { defaultRoute: "home" });
    unsubscribe = router.usePlugin(browserPluginFactory({}, browser));
    await router.start();
  });

  afterEach(() => {
    if (router.isActive()) {
      router.stop();
    }

    unsubscribe?.();
    unsubscribe = undefined;
    vi.restoreAllMocks();
  });

  it.each(["stop", "teardown"] as const)(
    "%s discards the queued event instead of replaying it",
    async (interrupt) => {
      await expect(run(interrupt, QUEUED_MATCHED)).resolves.toStrictEqual({
        replayed: false,
        writes: [],
        path: interrupt === "stop" ? "(stopped)" : BLOCKING.path,
      });
    },
  );

  it("teardown discards a queued event that would write history directly", async () => {
    // The unmatched branch does not go through a lifecycle hook, so removing
    // the hooks does not stop it — only discarding the event does.
    await expect(run("teardown", QUEUED_UNMATCHED)).resolves.toStrictEqual({
      replayed: false,
      writes: [],
      path: BLOCKING.path,
    });
  });

  it("CONTROL — uninterrupted, the queued matched event replays and navigates", async () => {
    const outcome = await run("none", QUEUED_MATCHED);

    expect(outcome.replayed).toBe(true);
    expect(outcome.path).toBe(QUEUED_MATCHED.path);
  });

  it("CONTROL — uninterrupted, the queued unmatched event replays and writes history", async () => {
    const outcome = await run("none", QUEUED_UNMATCHED);

    expect(outcome.replayed).toBe(true);
    // `toContain`, not a count: a live plugin also writes from
    // `onTransitionSuccess`, and how many times is not this cell's claim.
    expect(outcome.writes).toContain(`replace:${BLOCKING.path}`);
  });
});
