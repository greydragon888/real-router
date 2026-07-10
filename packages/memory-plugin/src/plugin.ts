import type {
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

/**
 * Tags the plugin's own back/forward/go restore navigation so its commit can be
 * told apart from a concurrent user navigation by IDENTITY, not timing.
 * `#navigatingFromHistory` is a plugin-global boolean answering a per-navigation
 * question ("is *this* commit my restore?"); consuming it by timing ("the first
 * commit after the flag was set") mis-attributes it when navigations interleave —
 * #807 (sync same-tick) and #1234 (async-guard cancellation) are the two faces.
 * Mirrors the `source` convention the URL plugins already use (browser/hash:
 * `POPSTATE_SOURCE`). `source` is not a typed core `NavigationOptions` field; core
 * forwards `opts` to `onTransitionSuccess` opaquely (verified), so the tag rides
 * through.
 */
const MEMORY_RESTORE = "memory-restore";

/** `NavigationOptions` carrying the plugin-convention `source` tag (not a core field). */
type NavigationOptionsWithSource = NavigationOptions & { source?: string };

/** @internal — instantiated by `memoryPluginFactory`; not part of the public API. */
export class MemoryPlugin {
  readonly #router: Router;
  readonly #api: PluginApi;
  readonly #maxHistory: number;
  // Stored entries are full State snapshots (#561). Snapshot semantics for
  // back/forward replay: api.navigateToState commits the stored State as-is,
  // immune to post-recording route mutations (routes.update / routes.replace
  // changing defaultParams or meta) and to non-idempotent dynamic
  // forwardFn / buildPath interceptors. Activation guards still run at
  // replay time — that is where current-world-state checks belong, not in
  // the navigation pipeline.
  readonly #entries: State[] = [];
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
    this.#api = api;
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
        if (
          this.#navigatingFromHistory &&
          (opts as NavigationOptionsWithSource).source === MEMORY_RESTORE
        ) {
          // Consume the flag on observing OUR OWN restore commit — matched by
          // identity (`source === MEMORY_RESTORE`), not by timing. #807 moved the
          // reset here (off a microtask) to fix the sync `back(); navigate()` race,
          // but timing-based consumption still mis-fires when an async `canActivate`
          // on the back target keeps the restore in flight and a concurrent
          // navigate() commits first: without the source check that navigate would
          // be swallowed as a phantom history-restore (no push, stale
          // direction/historyIndex) (#1234). The tag attributes the flag to the
          // navigation that actually set it; a foreign commit falls through to the
          // normal push branch below, and our cancelled #go clears the flag in its
          // own `.catch`.
          this.#navigatingFromHistory = false;
          this.#writeMemoryContext(toState, this.#pendingDirection);

          return;
        }

        if (opts.replace && this.#index >= 0) {
          this.#entries[this.#index] = toState;
        } else {
          this.#entries.length = this.#index + 1;
          this.#entries.push(toState);
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
        // Bump generation so any in-flight #go settler observes a mismatch
        // and skips its revert / flag reset — writing into cleared state
        // would otherwise leave #index pointing into an empty #entries (#505).
        this.#goGeneration++;
        this.#clear();
      },

      teardown: () => {
        /* v8 ignore next 3 -- @preserve: core's unsubscribe() already guards via `unsubscribed` flag; this idempotency check covers router.dispose() + unsubscribe() ordering edge cases */
        if (this.#disposed) {
          return;
        }

        this.#disposed = true;
        // Same generation bump as onStop — pre-teardown in-flight #go settlers
        // must not write into a released plugin (#505).
        this.#goGeneration++;
        this.#removeExtensions();
        this.#claim.release();
        this.#clear();
      },
    };
  }

  #writeMemoryContext(toState: State, direction: MemoryDirection): void {
    this.#claim.write(toState, { direction, historyIndex: this.#index });
  }

  #go(delta: number): void {
    if (!Number.isInteger(delta) || delta === 0) {
      return;
    }

    const targetIndex = this.#index + delta;

    if (targetIndex < 0 || targetIndex >= this.#entries.length) {
      return;
    }

    const entry = this.#entries[targetIndex];
    const currentState = this.#router.getState();

    if (entry.path === currentState?.path) {
      // Short-circuit: landing on an entry whose path matches the current
      // state skips api.navigateToState. Still rewrite state.context.memory
      // so subscribers see the new historyIndex + direction — otherwise
      // UI animation driven by `direction` sees a stale "navigate" value
      // and `state.context.memory.historyIndex` diverges from `#index`
      // until the next full transition (#508).
      this.#index = targetIndex;
      this.#writeMemoryContext(currentState, delta > 0 ? "forward" : "back");

      return;
    }

    const previousIndex = this.#index;
    const generation = ++this.#goGeneration;

    this.#pendingDirection = delta > 0 ? "forward" : "back";
    this.#navigatingFromHistory = true;
    this.#index = targetIndex;

    // navigateToState commits the stored snapshot verbatim — same primitive
    // every URL-driven flow uses (start, popstate, navigate-event). Skips
    // forwardState + buildPath re-resolution and their interceptors; route
    // mutations between record and replay do not retroactively change what
    // back/forward commits (#561). Tagged `source: MEMORY_RESTORE` so our own
    // commit is matched by identity in onTransitionSuccess (#1234).
    const restoreOpts: NavigationOptionsWithSource = {
      replace: true,
      source: MEMORY_RESTORE,
    };

    this.#api.navigateToState(entry, restoreOpts).catch(() => {
      // Reject only: guard block, ROUTE_NOT_FOUND, or cancellation by a newer
      // navigation. onTransitionSuccess never consumed the flag for us (either it
      // never fired — guard block — or a concurrent navigation committed with a
      // foreign `source` and took the push branch), so clear our flag here. The
      // generation guard skips a superseded #go whose optimistic target a newer
      // #go has already overtaken — it must not touch the newer call's state (#505).
      if (this.#goGeneration === generation) {
        this.#navigatingFromHistory = false;
        // Revert the optimistic index ONLY if it is still ours. A concurrent
        // navigate() that cancelled us has already re-based #index via its push
        // (#1234, back(-N ≥ 2)) — reverting to previousIndex would push #index
        // out of bounds. Same identity principle as the flag: act only if mine.
        if (this.#index === targetIndex) {
          this.#index = previousIndex;
        }
      }
    });
  }

  #clear(): void {
    this.#entries.length = 0;
    this.#index = -1;
    // Reset transient #go state as well: if #clear runs while a #go is in
    // flight, the reject-handler skips (generation mismatch) and would
    // otherwise leave #navigatingFromHistory stuck at true — the next
    // onTransitionSuccess after restart would take the history-restore
    // branch and silently skip pushing a new entry. Both fields are
    // "current #go intent", not persistent history, so resetting them on
    // clear is always correct (#505).
    this.#navigatingFromHistory = false;
    this.#pendingDirection = "navigate";
  }
}
