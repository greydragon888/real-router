import { LOGGER_CONTEXT } from "./constants";
import {
  createStateFromEvent,
  handleMissingState,
  shouldSkipTransition,
  updateBrowserState,
} from "./popstate-utils";
import { buildUrl, urlToPath } from "./url-utils";

import type {
  Browser,
  BrowserPluginOptions,
  HistoryState,
  RegExpCache,
  SharedFactoryState,
  URLParseOptions,
} from "./types";
import type {
  NavigationOptions,
  PluginApi,
  Router,
  State,
  Plugin,
} from "@real-router/core";

export class BrowserPlugin {
  readonly #router: Router;
  readonly #api: PluginApi;
  readonly #options: BrowserPluginOptions;
  readonly #browser: Browser;
  readonly #regExpCache: RegExpCache;
  readonly #prefix: string;
  readonly #transitionOptions: {
    source: string;
    replace: true;
    forceDeactivate?: boolean;
  };
  readonly #shared: SharedFactoryState;

  #isTransitioning = false;
  #deferredPopstateEvent: PopStateEvent | null = null;
  #removeStartInterceptor: (() => void) | undefined;

  constructor(
    router: Router,
    api: PluginApi,
    options: BrowserPluginOptions,
    browser: Browser,
    regExpCache: RegExpCache,
    transitionOptions: {
      source: string;
      replace: true;
      forceDeactivate?: boolean;
    },
    shared: SharedFactoryState,
  ) {
    this.#router = router;
    this.#api = api;
    this.#options = options;
    this.#browser = browser;
    this.#regExpCache = regExpCache;
    this.#transitionOptions = transitionOptions;
    this.#shared = shared;

    const normalizedOptions = options as URLParseOptions;

    this.#prefix = options.useHash ? `#${normalizedOptions.hashPrefix}` : "";
  }

  getPlugin(): Plugin {
    this.#removeStartInterceptor = this.#api.addInterceptor(
      "start",
      (next, path) => next(path ?? this.#browser.getLocation(this.#options)),
    );

    this.#augmentRouter();

    return {
      onStart: () => {
        if (this.#shared.removePopStateListener) {
          this.#shared.removePopStateListener();
        }

        this.#shared.removePopStateListener = this.#browser.addPopstateListener(
          (evt: PopStateEvent) => void this.#onPopState(evt),
        );
      },

      onStop: () => {
        if (this.#shared.removePopStateListener) {
          this.#shared.removePopStateListener();
          this.#shared.removePopStateListener = undefined;
        }
      },

      onTransitionSuccess: (
        toState: State,
        fromState: State | undefined,
        navOptions: NavigationOptions,
      ) => {
        this.#router.lastKnownState = Object.freeze({ ...toState });

        const replaceHistory =
          (navOptions.replace ?? !fromState) ||
          (!!navOptions.reload &&
            this.#router.areStatesEqual(toState, fromState, false));

        const url = this.#router.buildUrl(toState.name, toState.params);

        const shouldPreserveHash =
          this.#options.preserveHash &&
          (!fromState || fromState.path === toState.path);

        const finalUrl = shouldPreserveHash
          ? url + this.#browser.getHash()
          : url;

        updateBrowserState(
          toState,
          finalUrl,
          replaceHistory,
          this.#browser,
          this.#options,
        );
      },

      teardown: () => {
        this.#cleanupAugmentation();
      },
    };
  }

  #augmentRouter(): void {
    const router = this.#router;

    router.buildUrl = (route, params) => {
      const path = router.buildPath(route, params);

      return buildUrl(
        path,
        (this.#options as URLParseOptions).base,
        this.#prefix,
      );
    };

    router.matchUrl = (url) => {
      const path = urlToPath(
        url,
        this.#options as URLParseOptions,
        this.#regExpCache,
      );

      return path ? this.#api.matchPath(path) : undefined;
    };

    router.replaceHistoryState = (name, params = {}) => {
      const state = this.#api.buildState(name, params);

      if (!state) {
        throw new Error(
          `[real-router] Cannot replace state: route "${name}" is not found`,
        );
      }

      const builtState = this.#api.makeState(
        state.name,
        state.params,
        router.buildPath(state.name, state.params),
        {
          params: state.meta,
        },
        1, // forceId
      );
      const url = router.buildUrl(name, params);

      updateBrowserState(builtState, url, true, this.#browser, this.#options);
    };
  }

  #cleanupAugmentation(): void {
    if (this.#shared.removePopStateListener) {
      this.#shared.removePopStateListener();
      this.#shared.removePopStateListener = undefined;
    }

    /* v8 ignore next 4 -- @preserve: defensive guard, always set in constructor */
    if (this.#removeStartInterceptor) {
      this.#removeStartInterceptor();
      this.#removeStartInterceptor = undefined;
    }

    delete (this.#router as Partial<Router>).buildUrl;
    delete (this.#router as Partial<Router>).matchUrl;
    delete (this.#router as Partial<Router>).replaceHistoryState;
    delete (this.#router as Partial<Router>).lastKnownState;
  }

  #processDeferredEvent(): void {
    if (this.#deferredPopstateEvent) {
      const event = this.#deferredPopstateEvent;

      this.#deferredPopstateEvent = null;
      console.warn(`[${LOGGER_CONTEXT}] Processing deferred popstate event`);
      void this.#onPopState(event);
    }
  }

  async #onPopState(evt: PopStateEvent): Promise<void> {
    if (this.#isTransitioning) {
      console.warn(
        `[${LOGGER_CONTEXT}] Transition in progress, deferring popstate event`,
      );
      this.#deferredPopstateEvent = evt;

      return;
    }

    try {
      const transition = this.#prepareTransition(evt);

      if (!transition) {
        return;
      }

      await this.#navigate(transition);
    } catch (error) {
      this.#isTransitioning = false;
      this.#recoverFromCriticalError(error);
      this.#processDeferredEvent();
    }
  }

  #prepareTransition(evt: PopStateEvent) {
    const routerState = this.#router.getState();
    const state = createStateFromEvent(
      evt,
      this.#api,
      this.#browser,
      this.#options,
    );

    if (
      !state &&
      handleMissingState(this.#router, this.#api, this.#transitionOptions)
    ) {
      return;
    }

    if (!state || shouldSkipTransition(state, routerState, this.#router)) {
      return;
    }

    return { state, routerState };
  }

  async #navigate(transition: {
    state: State;
    routerState: State | undefined;
  }): Promise<void> {
    const { state, routerState } = transition;

    this.#isTransitioning = true;

    try {
      await this.#api.navigateToState(
        state,
        routerState,
        this.#transitionOptions,
      );
    } catch {
      // Transition errors (CANNOT_DEACTIVATE, etc.) are expected.
      // Success is handled by the router FSM chain (TRANSITION_SUCCESS event).
    } finally {
      this.#isTransitioning = false;
      this.#processDeferredEvent();
    }
  }

  #recoverFromCriticalError(error: unknown): void {
    console.error(`[${LOGGER_CONTEXT}] Critical error in onPopState`, error);

    try {
      const currentState = this.#router.getState();

      if (currentState) {
        const url = this.#router.buildUrl(
          currentState.name,
          currentState.params,
        );

        this.#browser.replaceState(currentState as HistoryState, "", url);
      }
    } catch (recoveryError) {
      console.error(
        `[${LOGGER_CONTEXT}] Failed to recover from critical error`,
        recoveryError,
      );
    }
  }
}
