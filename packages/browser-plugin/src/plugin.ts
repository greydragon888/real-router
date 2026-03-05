import { RouterError } from "@real-router/core";

import { LOGGER_CONTEXT } from "./constants";
import { getRouteFromEvent, updateBrowserState } from "./popstate-utils";
import { buildUrl, urlToPath } from "./url-utils";

import type {
  Browser,
  BrowserPluginOptions,
  SharedFactoryState,
} from "./types";
import type {
  NavigationOptions,
  Params,
  PluginApi,
  Router,
  State,
  Plugin,
} from "@real-router/core";

export class BrowserPlugin {
  readonly #router: Router;
  readonly #api: PluginApi;
  readonly #options: Required<BrowserPluginOptions>;
  readonly #browser: Browser;
  readonly #transitionOptions: {
    source: string;
    replace: true;
    forceDeactivate?: boolean;
  };
  readonly #shared: SharedFactoryState;

  #isTransitioning = false;
  #deferredPopstateEvent: PopStateEvent | null = null;
  readonly #removeStartInterceptor: () => void;
  readonly #removeExtensions: () => void;

  constructor(
    router: Router,
    api: PluginApi,
    options: Required<BrowserPluginOptions>,
    browser: Browser,
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
    this.#transitionOptions = transitionOptions;
    this.#shared = shared;

    this.#removeStartInterceptor = this.#api.addInterceptor(
      "start",
      (next, path) => next(path ?? this.#browser.getLocation()),
    );

    this.#removeExtensions = this.#api.extendRouter({
      buildUrl: (route: string, params?: Params) => {
        const path = this.#router.buildPath(route, params);

        return buildUrl(path, this.#options.base);
      },
      matchUrl: (url: string) => {
        const path = urlToPath(url, this.#options.base);

        return path ? this.#api.matchPath(path) : undefined;
      },
      replaceHistoryState: (name: string, params: Params = {}) => {
        const state = this.#api.buildState(name, params);

        if (!state) {
          throw new Error(
            `[real-router] Cannot replace state: route "${name}" is not found`,
          );
        }

        const builtState = this.#api.makeState(
          state.name,
          state.params,
          this.#router.buildPath(state.name, state.params),
          {
            params: state.meta,
          },
          1, // forceId
        );
        const url = this.#router.buildUrl(name, params);

        updateBrowserState(builtState, url, true, this.#browser);
      },
    });
  }

  getPlugin(): Plugin {
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
        const shouldReplaceHistory =
          (navOptions.replace ?? !fromState) ||
          (!!navOptions.reload &&
            this.#router.areStatesEqual(toState, fromState, false));

        const url = this.#router.buildUrl(toState.name, toState.params);

        const shouldPreserveHash =
          !fromState || fromState.path === toState.path;

        const finalUrl = shouldPreserveHash
          ? url + this.#browser.getHash()
          : url;

        updateBrowserState(
          toState,
          finalUrl,
          shouldReplaceHistory,
          this.#browser,
        );
      },

      teardown: () => {
        if (this.#shared.removePopStateListener) {
          this.#shared.removePopStateListener();
          this.#shared.removePopStateListener = undefined;
        }

        this.#removeStartInterceptor();
        this.#removeExtensions();
      },
    };
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

    this.#isTransitioning = true;

    try {
      const route = getRouteFromEvent(evt, this.#api, this.#browser);

      // eslint-disable-next-line unicorn/prefer-ternary
      if (route) {
        await this.#router.navigate(
          route.name,
          route.params,
          this.#transitionOptions,
        );
      } else {
        await this.#router.navigateToDefault({
          ...this.#transitionOptions,
          reload: true,
          replace: true,
        });
      }
    } catch (error) {
      if (!(error instanceof RouterError)) {
        this.#recoverFromCriticalError(error);
      }
    } finally {
      this.#isTransitioning = false;
      this.#processDeferredEvent();
    }
  }

  #recoverFromCriticalError(error: unknown): void {
    console.error(`[${LOGGER_CONTEXT}] Critical error in onPopState`, error);

    try {
      const currentState = this.#router.getState();

      /* v8 ignore next -- @preserve: router always has state after start(); defensive guard for edge cases */
      if (currentState) {
        const url = this.#router.buildUrl(
          currentState.name,
          currentState.params,
        );

        this.#browser.replaceState(currentState, url);
      }
    } catch (recoveryError) {
      console.error(
        `[${LOGGER_CONTEXT}] Failed to recover from critical error`,
        recoveryError,
      );
    }
  }
}
