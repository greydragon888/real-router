import { getRoutesApi } from "@real-router/core/api";

import {
  GHOST_EVENT_THRESHOLD,
  LISTENER_OPTIONS,
  TOUCH_PRELOAD_DELAY,
  TOUCH_SCROLL_THRESHOLD,
} from "./constants";
import { isSlowConnection } from "./network";

import type {
  PreloadFn,
  PreloadFnFactory,
  PreloadPluginOptions,
} from "./types";
import type {
  Params,
  Plugin,
  PluginFactory,
  Router,
  State,
  TreeChangedEvent,
} from "@real-router/core";
import type { PluginApi } from "@real-router/core/api";

declare module "@real-router/core" {
  interface Router {
    matchUrl?: (url: string) => State | undefined;
  }
}

const STATE_CACHE_LIMIT = 32;

export class PreloadPlugin {
  readonly #router: Router;
  readonly #api: PluginApi;
  readonly #options: Required<PreloadPluginOptions>;
  readonly #getDependency: Parameters<PluginFactory>[1];
  readonly #removeExtensions: () => void;
  readonly #removeChangesSubscription: () => void;
  readonly #compiledPreloads = new Map<
    string,
    { fn: PreloadFn; factory: PreloadFnFactory }
  >();
  // Pre-resolved State cache keyed by anchor href. Populated when a hover/touch
  // resolves a route via router.matchUrl, consumed once via
  // router.getPreloadedState(href). Single-use semantics (delete-on-read) keep
  // the cache from drifting out of sync with current world state — once the
  // consumer commits the snapshot via api.navigateToState, the entry is gone.
  // Bounded with insertion-order eviction (#562).
  readonly #stateCache = new Map<string, State>();

  #currentAnchor: HTMLAnchorElement | null = null;
  #hoverTimer: ReturnType<typeof setTimeout> | null = null;
  #touchTimer: ReturnType<typeof setTimeout> | null = null;
  #touchStartY = 0;
  #lastTouchTarget: EventTarget | null = null;
  #lastTouchTimeStamp = Number.NaN;

  constructor(
    router: Router,
    api: PluginApi,
    options: Required<PreloadPluginOptions>,
    getDependency: Parameters<PluginFactory>[1],
  ) {
    this.#router = router;
    this.#api = api;
    this.#options = options;
    this.#getDependency = getDependency;

    const cachedOptions = { ...options };

    this.#removeExtensions = api.extendRouter({
      getPreloadSettings: () => cachedOptions,
      getPreloadedState: (href: string): State | undefined => {
        const state = this.#stateCache.get(href);

        if (state) {
          this.#stateCache.delete(href);
        }

        return state;
      },
    });

    // Drop compiled-preload entries for routes removed from the tree. Without
    // this, `#resolvePreload` can never reach them again (matchUrl returns
    // undefined for a removed route), so the entry would be dead memory until
    // teardown. `add`/`update` need no handling — `#resolvePreload` already
    // revalidates lazily via the cached `factory` reference.
    this.#removeChangesSubscription = getRoutesApi(router).subscribeChanges(
      (event) => {
        this.#onTreeChanged(event);
      },
    );
  }

  getPlugin(): Plugin {
    return {
      onStart: () => {
        document.addEventListener(
          "mouseover",
          this.#handleMouseOver,
          LISTENER_OPTIONS,
        );
        document.addEventListener(
          "touchstart",
          this.#handleTouchStart,
          LISTENER_OPTIONS,
        );
        document.addEventListener(
          "touchmove",
          this.#handleTouchMove,
          LISTENER_OPTIONS,
        );
      },

      onStop: () => {
        this.#cleanup();
      },

      teardown: () => {
        this.#cleanup();
        this.#removeChangesSubscription();
        this.#removeExtensions();
      },
    };
  }

  #onTreeChanged(event: TreeChangedEvent): void {
    switch (event.op) {
      case "remove": {
        for (const route of event.removedSubtree) {
          this.#compiledPreloads.delete(route.name);
        }

        this.#invalidateStateCache();

        break;
      }
      case "replace": {
        for (const route of event.removed) {
          this.#compiledPreloads.delete(route.name);
        }

        this.#invalidateStateCache();

        break;
      }
      case "clear": {
        this.#compiledPreloads.clear();
        this.#invalidateStateCache();

        break;
      }
      // "add" / "update": lazy factory-reference revalidation in
      // #resolvePreload handles these — no eager cleanup needed.
    }
  }

  /**
   * Drops all pre-resolved `State` snapshots. `#stateCache` is keyed by `href`,
   * not route name, so a removed/changed route cannot be pruned selectively —
   * clearing the whole (≤32-entry) cache prevents `getPreloadedState(href)` from
   * handing a consumer a `State` that points at a route no longer in the tree.
   * Entries repopulate on the next hover/touch.
   */
  #invalidateStateCache(): void {
    this.#stateCache.clear();
  }

  readonly #handleMouseOver = (event: MouseEvent): void => {
    if (this.#isGhostMouseEvent(event)) {
      return;
    }

    const anchor = this.#findAnchor(event.target);

    if (anchor === this.#currentAnchor) {
      return;
    }

    this.#cancelHover();
    this.#currentAnchor = anchor;

    const preload = this.#resolveAnchorPreload(anchor);

    if (!preload) {
      return;
    }

    this.#hoverTimer = setTimeout(() => {
      this.#hoverTimer = null;
      preload.fn(preload.params).catch(() => {});
    }, this.#options.delay);
  };

  readonly #handleTouchStart = (event: TouchEvent): void => {
    this.#lastTouchTarget = event.target;
    this.#lastTouchTimeStamp = event.timeStamp;

    this.#cancelTouch();

    const anchor = this.#findAnchor(event.target);
    const preload = this.#resolveAnchorPreload(anchor);

    if (!preload || event.touches.length === 0) {
      return;
    }

    this.#touchStartY = event.touches[0].clientY;

    this.#touchTimer = setTimeout(() => {
      this.#touchTimer = null;
      preload.fn(preload.params).catch(() => {});
    }, TOUCH_PRELOAD_DELAY);
  };

  readonly #handleTouchMove = (event: TouchEvent): void => {
    if (this.#touchTimer === null || event.touches.length === 0) {
      return;
    }

    const deltaY = Math.abs(event.touches[0].clientY - this.#touchStartY);

    if (deltaY > TOUCH_SCROLL_THRESHOLD) {
      this.#cancelTouch();
    }
  };

  #findAnchor(target: EventTarget | null): HTMLAnchorElement | null {
    return target instanceof Element
      ? target.closest<HTMLAnchorElement>("a[href]")
      : null;
  }

  #resolveAnchorPreload(
    anchor: HTMLAnchorElement | null | undefined,
  ): { fn: PreloadFn; params: Params } | undefined {
    if (!anchor) {
      return undefined;
    }

    if ("noPreload" in anchor.dataset) {
      return undefined;
    }

    if (this.#options.networkAware && isSlowConnection()) {
      return undefined;
    }

    return this.#resolvePreload(anchor);
  }

  #resolvePreload(
    anchor: HTMLAnchorElement,
  ): { fn: PreloadFn; params: Params } | undefined {
    const state = this.#router.matchUrl?.(anchor.href);

    if (!state) {
      return undefined;
    }

    this.#cacheState(anchor.href, state);

    const config = this.#api.getRouteConfig(state.name);
    const factory =
      typeof config?.preload === "function"
        ? (config.preload as PreloadFnFactory)
        : undefined;

    if (!factory) {
      this.#compiledPreloads.delete(state.name);

      return undefined;
    }

    const cached = this.#compiledPreloads.get(state.name);

    if (cached?.factory === factory) {
      return { fn: cached.fn, params: state.params };
    }

    let fn: PreloadFn;

    try {
      fn = factory(this.#router, this.#getDependency);
    } catch {
      return undefined;
    }

    this.#compiledPreloads.set(state.name, { fn, factory });

    return { fn, params: state.params };
  }

  #cacheState(href: string, state: State): void {
    // Re-insert to refresh recency ordering (Map iteration is insertion order).
    if (this.#stateCache.has(href)) {
      this.#stateCache.delete(href);
    } else if (this.#stateCache.size >= STATE_CACHE_LIMIT) {
      // Evict the oldest (first-inserted) entry. size >= LIMIT > 0, so the
      // iterator yields at least one key — destructuring it is safe.
      const [oldest] = this.#stateCache.keys();

      this.#stateCache.delete(oldest);
    }

    this.#stateCache.set(href, state);
  }

  #isGhostMouseEvent(event: MouseEvent): boolean {
    const delta = event.timeStamp - this.#lastTouchTimeStamp;

    return (
      delta >= 0 &&
      delta < GHOST_EVENT_THRESHOLD &&
      event.target === this.#lastTouchTarget
    );
  }

  #cancelHover(): void {
    if (this.#hoverTimer !== null) {
      clearTimeout(this.#hoverTimer);
      this.#hoverTimer = null;
    }

    this.#currentAnchor = null;
  }

  #cancelTouch(): void {
    if (this.#touchTimer !== null) {
      clearTimeout(this.#touchTimer);
      this.#touchTimer = null;
    }
  }

  #cleanup(): void {
    document.removeEventListener(
      "mouseover",
      this.#handleMouseOver,
      LISTENER_OPTIONS,
    );
    document.removeEventListener(
      "touchstart",
      this.#handleTouchStart,
      LISTENER_OPTIONS,
    );
    document.removeEventListener(
      "touchmove",
      this.#handleTouchMove,
      LISTENER_OPTIONS,
    );

    this.#cancelHover();
    this.#cancelTouch();
    this.#lastTouchTarget = null;
    this.#lastTouchTimeStamp = Number.NaN;
    this.#stateCache.clear();
  }
}
