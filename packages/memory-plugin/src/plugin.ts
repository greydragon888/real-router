import type { HistoryEntry, MemoryPluginOptions } from "./types";
import type {
  NavigationOptions,
  Plugin,
  Router,
  State,
} from "@real-router/core";
import type { PluginApi } from "@real-router/core/api";

const DEFAULT_MAX_HISTORY = 1000;

export class MemoryPlugin {
  readonly #router: Router;
  readonly #maxHistory: number;
  readonly #entries: HistoryEntry[] = [];
  readonly #removeExtensions: () => void;
  #index = -1;
  #navigatingFromHistory = false;

  constructor(router: Router, api: PluginApi, options: MemoryPluginOptions) {
    this.#router = router;
    this.#maxHistory = options.maxHistoryLength ?? DEFAULT_MAX_HISTORY;

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
          this.#entries.splice(this.#index + 1);
          this.#entries.push(entry);
          this.#index = this.#entries.length - 1;

          if (this.#maxHistory > 0 && this.#entries.length > this.#maxHistory) {
            const overflow = this.#entries.length - this.#maxHistory;

            this.#entries.splice(0, overflow);
            this.#index = Math.max(0, this.#index - overflow);
          }
        }
      },

      onStop: () => {
        this.#clear();
      },

      teardown: () => {
        this.#removeExtensions();
        this.#clear();
      },
    };
  }

  #go(delta: number): void {
    if (delta === 0) {
      return;
    }

    const targetIndex = this.#index + delta;

    if (targetIndex < 0 || targetIndex >= this.#entries.length) {
      return;
    }

    const entry = this.#entries[targetIndex];

    this.#navigatingFromHistory = true;

    void this.#router
      .navigate(entry.name, entry.params, { replace: true })
      .then(() => {
        this.#index = targetIndex;
      })
      .catch(() => {
        // Guard blocked — index stays unchanged
      })
      .finally(() => {
        this.#navigatingFromHistory = false;
      });
  }

  #clear(): void {
    this.#entries.length = 0;
    this.#index = -1;
  }
}
