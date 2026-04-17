import type {
  HistoryEntry,
  MemoryContext,
  MemoryDirection,
  MemoryPluginOptions,
} from "./types";
import type {
  NavigationOptions,
  Plugin,
  Router,
  State,
} from "@real-router/core";
import type { PluginApi } from "@real-router/core/api";

const DEFAULT_MAX_HISTORY = 1000;

/** @internal — instantiated by `memoryPluginFactory`; not part of the public API. */
export class MemoryPlugin {
  readonly #router: Router;
  readonly #maxHistory: number;
  readonly #entries: HistoryEntry[] = [];
  readonly #removeExtensions: () => void;
  readonly #claim: {
    write: (state: State, value: MemoryContext) => void;
    release: () => void;
  };
  #index = -1;
  #navigatingFromHistory = false;
  #pendingDirection: MemoryDirection = "navigate";
  #goGeneration = 0;
  #disposed = false;

  constructor(router: Router, api: PluginApi, options: MemoryPluginOptions) {
    this.#router = router;
    this.#maxHistory = options.maxHistoryLength ?? DEFAULT_MAX_HISTORY;
    this.#claim = api.claimContextNamespace("memory");

    this.#removeExtensions = api.extendRouter({
      back: () => {
        this.#go(-1);
      },
      forward: () => {
        this.#go(1);
      },
      go: (delta: number) => {
        this.#go(delta);
      },
      canGoBack: () => this.#index > 0,
      canGoForward: () => this.#index < this.#entries.length - 1,
    });
  }

  getPlugin(): Plugin {
    return {
      onTransitionSuccess: (
        toState: State,
        _fromState: State | undefined,
        opts: NavigationOptions,
      ) => {
        if (this.#navigatingFromHistory) {
          this.#writeMemoryContext(toState, this.#pendingDirection);

          return;
        }

        const entry: HistoryEntry = {
          name: toState.name,
          params: toState.params,
          path: toState.path,
        };

        if (opts.replace && this.#index >= 0) {
          this.#entries[this.#index] = entry;
        } else {
          this.#entries.length = this.#index + 1;
          this.#entries.push(entry);
          this.#index = this.#entries.length - 1;

          if (this.#maxHistory > 0 && this.#entries.length > this.#maxHistory) {
            const overflow = this.#entries.length - this.#maxHistory;

            this.#entries.splice(0, overflow);
            this.#index = Math.max(0, this.#index - overflow);
          }
        }

        this.#writeMemoryContext(toState, "navigate");
      },

      onStop: () => {
        this.#clear();
      },

      teardown: () => {
        /* v8 ignore next 3 -- @preserve: core's unsubscribe() already guards via `unsubscribed` flag; this idempotency check covers router.dispose() + unsubscribe() ordering edge cases */
        if (this.#disposed) {
          return;
        }

        this.#disposed = true;
        this.#removeExtensions();
        this.#claim.release();
        this.#clear();
      },
    };
  }

  #writeMemoryContext(toState: State, direction: MemoryDirection): void {
    this.#claim.write(
      toState,
      Object.freeze({ direction, historyIndex: this.#index }),
    );
  }

  #go(delta: number): void {
    if (delta === 0 || !Number.isFinite(delta) || !Number.isInteger(delta)) {
      return;
    }

    const targetIndex = this.#index + delta;

    if (targetIndex < 0 || targetIndex >= this.#entries.length) {
      return;
    }

    const entry = this.#entries[targetIndex];
    const currentState = this.#router.getState();

    if (entry.path === currentState?.path) {
      this.#index = targetIndex;

      return;
    }

    const previousIndex = this.#index;
    const generation = ++this.#goGeneration;

    this.#pendingDirection = delta > 0 ? "forward" : "back";
    this.#navigatingFromHistory = true;
    this.#index = targetIndex;

    void this.#router
      .navigate(entry.name, entry.params, { replace: true })
      .catch(() => {
        if (this.#goGeneration === generation) {
          this.#index = previousIndex;
        }
      })
      .finally(() => {
        if (this.#goGeneration === generation) {
          this.#navigatingFromHistory = false;
        }
      });
  }

  #clear(): void {
    this.#entries.length = 0;
    this.#index = -1;
  }
}
