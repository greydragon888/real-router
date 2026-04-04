import {
  GHOST_EVENT_THRESHOLD,
  TOUCH_PRELOAD_DELAY,
  TOUCH_SCROLL_THRESHOLD,
} from "./constants";
import { isSlowConnection } from "./network";

import type { PreloadPluginOptions } from "./types";
import type { Params, Plugin, Router, State } from "@real-router/core";
import type { PluginApi } from "@real-router/core/api";

declare module "@real-router/core" {
  interface Router {
    matchUrl?: (url: string) => State | undefined;
  }
}

export class PreloadPlugin {
  readonly #router: Router;
  readonly #api: PluginApi;
  readonly #options: Required<PreloadPluginOptions>;
  readonly #removeExtensions: () => void;

  #currentAnchor: HTMLAnchorElement | null = null;
  #hoverTimer: ReturnType<typeof setTimeout> | null = null;
  #touchTimer: ReturnType<typeof setTimeout> | null = null;
  #touchStartY = 0;
  #lastTouchStartEvent: {
    target: EventTarget | null;
    timeStamp: number;
  } | null = null;

  constructor(
    router: Router,
    api: PluginApi,
    options: Required<PreloadPluginOptions>,
  ) {
    this.#router = router;
    this.#api = api;
    this.#options = options;

    this.#removeExtensions = api.extendRouter({
      getPreloadSettings: () => ({ ...options }),
    });
  }

  getPlugin(): Plugin {
    return {
      onStart: () => {
        document.addEventListener("mouseover", this.#handleMouseOver, {
          capture: true,
          passive: true,
        });
        document.addEventListener("touchstart", this.#handleTouchStart, {
          capture: true,
          passive: true,
        });
        document.addEventListener("touchmove", this.#handleTouchMove, {
          capture: true,
          passive: true,
        });
      },

      onStop: () => {
        this.#cleanup();
      },

      teardown: () => {
        this.#cleanup();
        this.#removeExtensions();
      },
    };
  }

  readonly #handleMouseOver = (event: MouseEvent): void => {
    if (this.#isGhostMouseEvent(event)) {
      return;
    }

    const target = event.target as Element | null;

    if (!target || !("closest" in target)) {
      this.#cancelHover();

      return;
    }

    const anchor = target.closest<HTMLAnchorElement>("a[href]");

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
    this.#lastTouchStartEvent = {
      target: event.target,
      timeStamp: event.timeStamp,
    };

    this.#cancelTouch();

    const target = event.target as Element | null;
    const anchor =
      target && "closest" in target
        ? target.closest<HTMLAnchorElement>("a[href]")
        : null;
    const preload = this.#resolveAnchorPreload(anchor);

    if (!preload) {
      return;
    }

    this.#touchStartY = event.touches[0].clientY;

    this.#touchTimer = setTimeout(() => {
      this.#touchTimer = null;
      preload.fn(preload.params).catch(() => {});
    }, TOUCH_PRELOAD_DELAY);
  };

  readonly #handleTouchMove = (event: TouchEvent): void => {
    if (this.#touchTimer === null) {
      return;
    }

    const deltaY = Math.abs(event.touches[0].clientY - this.#touchStartY);

    if (deltaY > TOUCH_SCROLL_THRESHOLD) {
      this.#cancelTouch();
    }
  };

  #resolveAnchorPreload(
    anchor: HTMLAnchorElement | null | undefined,
  ): { fn: (params: Params) => Promise<unknown>; params: Params } | undefined {
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
  ): { fn: (params: Params) => Promise<unknown>; params: Params } | undefined {
    const state = this.#router.matchUrl?.(anchor.href);

    if (!state) {
      return undefined;
    }

    const config = this.#api.getRouteConfig(state.name);

    if (typeof config?.preload !== "function") {
      return undefined;
    }

    return {
      fn: config.preload as (params: Params) => Promise<unknown>,
      params: state.params,
    };
  }

  #isGhostMouseEvent(event: MouseEvent): boolean {
    return (
      this.#lastTouchStartEvent !== null &&
      event.target === this.#lastTouchStartEvent.target &&
      event.timeStamp - this.#lastTouchStartEvent.timeStamp <
        GHOST_EVENT_THRESHOLD
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
    document.removeEventListener("mouseover", this.#handleMouseOver, {
      capture: true,
    });
    document.removeEventListener("touchstart", this.#handleTouchStart, {
      capture: true,
    });
    document.removeEventListener("touchmove", this.#handleTouchMove, {
      capture: true,
    });

    this.#cancelHover();
    this.#cancelTouch();
    this.#lastTouchStartEvent = null;
  }
}
