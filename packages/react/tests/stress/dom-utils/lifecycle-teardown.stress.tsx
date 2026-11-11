/**
 * Lifecycle teardown leak guards for the reactive dom-utils (#809 follow-up).
 *
 * The five reactive utilities (createRouteAnnouncer, createScrollRestoration,
 * createDirectionTracker, createViewTransitions, createScrollSpy) each register
 * resources that OUTLIVE the returned instance unless `destroy()` releases them:
 * `router.subscribe` / `router.subscribeLeave` registrations, plugin-API event
 * listeners (`getPluginApi(router).addEventListener`), global `pagehide` /
 * `popstate` listeners, and IntersectionObserver / MutationObserver instances.
 * A create→destroy cycle that forgets one teardown leaks one resource per cycle
 * into a long-lived router / global. Timers, rAF handles and DOM nodes are not
 * counted.
 *
 * Discriminating design (NOT a heap snapshot — instances from a create→destroy
 * loop are unreferenced and GC-reclaimed regardless of whether destroy() ran, so
 * a heap delta is structurally blind to the leak). Instead each guard counts the
 * **live** resource against a long-lived owner across `CYCLES` cycles:
 *
 *   healthy teardown → count returns to its baseline (0)
 *   broken teardown  → count grows to `CYCLES` (≈1000)
 *
 * The ≥1000× gap is the proven discriminating power. To re-validate: delete an
 * `unsubscribe()` / `removeEventListener` / `disconnect()` call from any utility's
 * `destroy()` and the matching assertion fails with the leaked count — except in
 * scroll-spy's debouncer and cooldown, whose timers and `scrollend` listener only
 * an intersection or a hash navigation creates.
 */
import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createDirectionTracker,
  createRouteAnnouncer,
  createScrollRestoration,
  createScrollSpy,
  createViewTransitions,
} from "../../../src/dom-utils";

import type { PluginFactory, Router } from "@real-router/core";

// Plugin-API listeners are counted at the module export: the API object is
// frozen and shared per router (#1805), so it cannot be wrapped in place.
const { pluginCounts } = vi.hoisted(() => ({
  pluginCounts: new WeakMap<object, { plugin: number }>(),
}));

vi.mock(import("@real-router/core/api"), async (importOriginal) => {
  const actual = await importOriginal();

  const getPluginApi: typeof actual.getPluginApi = (router) => {
    const api = actual.getPluginApi(router);
    const live = pluginCounts.get(router);

    if (live === undefined) {
      return api;
    }

    const addEventListener: typeof api.addEventListener = (eventName, cb) => {
      live.plugin += 1;
      const off = api.addEventListener(eventName, cb);

      return () => {
        live.plugin -= 1;
        off();
      };
    };

    return { ...api, addEventListener };
  };

  return { ...actual, getPluginApi };
});

const ROUTES = [
  { name: "home", path: "/" },
  { name: "about", path: "/about" },
];

const CYCLES = 1000;

// Minimal URL-context plugin so createScrollSpy sees a `state.context.url` and
// wires up its IntersectionObserver instead of warn-once + NOOP.
const urlContextPlugin: PluginFactory = (router) => {
  const claim = getPluginApi(router).claimContextNamespace("url");

  return {
    onTransitionSuccess: (toState) => {
      claim.write(toState, { hash: "", hashChanged: false });
    },
  };
};

/**
 * Track the live (registered-but-not-released) `subscribe` / `subscribeLeave`
 * registrations and plugin-API listeners of `router`.
 */
function instrumentRouter(router: Router): {
  sub: number;
  leave: number;
  plugin: number;
} {
  const live = { sub: 0, leave: 0, plugin: 0 };

  pluginCounts.set(router, live);

  const realSubscribe = router.subscribe.bind(router);

  router.subscribe = (listener: Parameters<Router["subscribe"]>[0]) => {
    live.sub += 1;
    const unsub = realSubscribe(listener);

    return () => {
      live.sub -= 1;
      unsub();
    };
  };

  const realSubscribeLeave = router.subscribeLeave.bind(router);

  router.subscribeLeave = (
    listener: Parameters<Router["subscribeLeave"]>[0],
  ) => {
    live.leave += 1;
    const off = realSubscribeLeave(listener);

    return () => {
      live.leave -= 1;
      off();
    };
  };

  return live;
}

describe("dom-utils reactive lifecycle — create→destroy leaks no resources", () => {
  let liveListeners: Map<string, number>;

  beforeEach(() => {
    // Track global event-listener balance by type (pagehide, popstate, …).
    liveListeners = new Map<string, number>();
    const realAdd = globalThis.addEventListener.bind(globalThis);
    const realRemove = globalThis.removeEventListener.bind(globalThis);

    vi.spyOn(globalThis, "addEventListener").mockImplementation(
      (type: string, ...rest: unknown[]) => {
        liveListeners.set(type, (liveListeners.get(type) ?? 0) + 1);

        (realAdd as (t: string, ...a: unknown[]) => void)(type, ...rest);
      },
    );
    vi.spyOn(globalThis, "removeEventListener").mockImplementation(
      (type: string, ...rest: unknown[]) => {
        liveListeners.set(type, (liveListeners.get(type) ?? 0) - 1);

        (realRemove as (t: string, ...a: unknown[]) => void)(type, ...rest);
      },
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it(`createRouteAnnouncer: ${CYCLES} cycles release every router.subscribe`, async () => {
    const router = createRouter(ROUTES);

    await router.start("/");

    const live = instrumentRouter(router);

    for (let i = 0; i < CYCLES; i += 1) {
      createRouteAnnouncer(router).destroy();
    }

    expect(live.sub).toBe(0);

    router.stop();
  });

  it(`createScrollRestoration: ${CYCLES} cycles release subscribe + pagehide and popstate listeners`, async () => {
    const router = createRouter(ROUTES);

    await router.start("/");

    const live = instrumentRouter(router);

    for (let i = 0; i < CYCLES; i += 1) {
      createScrollRestoration(router).destroy();
    }

    expect(live.sub).toBe(0);
    expect(liveListeners.get("pagehide") ?? 0).toBe(0);
    expect(liveListeners.get("popstate") ?? 0).toBe(0);

    router.stop();
  });

  it(`createDirectionTracker: ${CYCLES} cycles release subscribeLeave, plugin-API listeners + popstate listener`, async () => {
    const router = createRouter(ROUTES);

    await router.start("/");

    const live = instrumentRouter(router);

    for (let i = 0; i < CYCLES; i += 1) {
      createDirectionTracker(router).destroy();
    }

    expect(live.leave).toBe(0);
    expect(live.plugin).toBe(0);
    expect(liveListeners.get("popstate") ?? 0).toBe(0);

    router.stop();
  });

  it(`createViewTransitions: ${CYCLES} cycles release subscribe + subscribeLeave`, async () => {
    // Enable the View Transitions code path (jsdom lacks startViewTransition).
    vi.stubGlobal(
      "document",
      Object.assign(globalThis.document, {
        startViewTransition: (cb: () => void) => {
          cb();

          return {
            finished: Promise.resolve(),
            ready: Promise.resolve(),
            updateCallbackDone: Promise.resolve(),
            skipTransition: () => {},
          };
        },
      }),
    );

    const router = createRouter(ROUTES);

    await router.start("/");

    const live = instrumentRouter(router);

    for (let i = 0; i < CYCLES; i += 1) {
      createViewTransitions(router).destroy();
    }

    expect(live.sub).toBe(0);
    expect(live.leave).toBe(0);

    router.stop();
    vi.unstubAllGlobals();
  });

  it(`createScrollSpy: ${CYCLES} cycles before and after start release router.subscribe + every Intersection/Mutation observer`, async () => {
    let liveObservers = 0;

    class CountingObserver {
      private released = false;

      constructor() {
        liveObservers += 1;
      }

      observe(): void {
        /* no-op */
      }

      unobserve(): void {
        /* no-op */
      }

      disconnect(): void {
        if (!this.released) {
          this.released = true;
          liveObservers -= 1;
        }
      }

      takeRecords(): [] {
        return [];
      }
    }

    vi.stubGlobal("IntersectionObserver", CountingObserver);
    vi.stubGlobal("MutationObserver", CountingObserver);

    const router = createRouter(ROUTES);

    router.usePlugin(urlContextPlugin);

    const live = instrumentRouter(router);

    // Before start() the URL-plugin detector waits for the first state on a
    // one-shot router.subscribe, which destroy() releases.
    for (let i = 0; i < CYCLES; i += 1) {
      createScrollSpy(router, { selector: "[id]" }).destroy();
    }

    expect(live.sub).toBe(0);

    await router.start("/");

    const anchor = document.createElement("section");

    anchor.id = "anchor";
    document.body.append(anchor);

    for (let i = 0; i < CYCLES; i += 1) {
      createScrollSpy(router, { selector: "[id]" }).destroy();
    }

    expect(liveObservers).toBe(0);
    expect(live.sub).toBe(0);
    expect(live.leave).toBe(0);

    router.stop();
    vi.unstubAllGlobals();
  });
});
