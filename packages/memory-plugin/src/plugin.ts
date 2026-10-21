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
 * Tags the plugin's own back/forward/go restore navigation, as the URL plugins
 * tag theirs (browser/hash: `POPSTATE_SOURCE`). `source` is not a typed core
 * `NavigationOptions` field; core forwards `opts` to `onTransitionSuccess`
 * opaquely, so the tag rides through.
 *
 * ⚠ The tag is the same on every restore of this plugin, so it does not say
 * WHICH restore a commit belongs to — the record its navigation filed does
 * (`#restores`).
 */
const MEMORY_RESTORE = "memory-restore";

/** `NavigationOptions` carrying the plugin-convention `source` tag (not a core field). */
type NavigationOptionsWithSource = NavigationOptions & { source?: string };

/** A `back()` / `forward()` / `go()`: the stack index it moves to. */
interface Restore {
  readonly targetIndex: number;
  readonly direction: MemoryDirection;
}

/** @internal — instantiated by `memoryPluginFactory`; not part of the public API. */
export class MemoryPlugin {
  readonly #router: Router;
  readonly #api: PluginApi;
  readonly #maxHistory: number;
  // Stored entries are full State snapshots (#561). Snapshot semantics for
  // back/forward replay: api.navigateToState commits the stored State's values
  // (both channels are re-copied and frozen by that door since #1792),
  // immune to post-recording route mutations (routes.update / routes.replace
  // changing defaultParams or meta) and to non-idempotent dynamic
  // forwardFn / `forwardState` interceptors. Activation guards still run at
  // replay time — that is where current-world-state checks belong, not in
  // the navigation pipeline.
  readonly #entries: State[] = [];
  readonly #removeExtensions: () => void;
  readonly #claim: {
    write: (state: State, value: MemoryContext) => void;
    release: () => void;
  };
  // The index of the entry the router shows.
  #shown = -1;
  // Each restore's record, filed under the `context` of the navigation it
  // starts — every navigation's state gets a `context` of its own, and the
  // committed state carries the one its start announced.
  readonly #restores = new WeakMap<object, Restore>();
  // The restore whose `navigateToState` call is running, until its navigation
  // is announced: the first one announced inside the call.
  #staged: Restore | undefined;
  // The restore whose navigation is running, until it fails, lands, or another
  // navigation commits over it.
  #inFlight: Restore | undefined;
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
      canGoBack: () => this.#position() > 0,
      canGoForward: () => this.#position() < this.#entries.length - 1,
    });
  }

  getPlugin(): Plugin {
    return {
      onTransitionStart: (toState: State) => {
        const restore = this.#staged;

        if (restore !== undefined) {
          this.#staged = undefined;
          this.#restores.set(toState.context, restore);
          this.#inFlight = restore;
        }
      },

      onTransitionSuccess: (
        toState: State,
        _fromState: State | undefined,
        opts: NavigationOptions,
      ) => {
        const restore = this.#restores.get(toState.context);

        if (restore !== undefined) {
          // A restore's own commit, matched by its navigation rather than by
          // timing (#807, #1234): a concurrent navigation that commits first is
          // a foreign commit and takes the branch below.
          this.#inFlight = undefined;
          this.#shown = restore.targetIndex;
          this.#writeMemoryContext(toState, restore.direction);

          return;
        }

        // A commit over a restore still in flight applies to the entry that
        // restore moves to (#1234).
        const base = this.#position();

        this.#inFlight = undefined;

        if (opts.replace && base >= 0) {
          this.#entries[base] = toState;
          this.#shown = base;
        } else {
          this.#entries.length = base + 1;
          this.#entries.push(toState);
          this.#shown = this.#entries.length - 1;

          if (this.#maxHistory > 0 && this.#entries.length > this.#maxHistory) {
            const overflow = this.#entries.length - this.#maxHistory;

            this.#entries.splice(0, overflow);
            this.#shown = Math.max(0, this.#shown - overflow);
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

  /**
   * Where the stack stands: the entry the restore in flight moves to, else the
   * one the router shows. A restore moves it only once its navigation is
   * announced, and stops moving it when that navigation fails — so a refusal
   * leaves nothing to undo, whenever and however it comes (#1803).
   */
  #position(): number {
    return this.#inFlight?.targetIndex ?? this.#shown;
  }

  #writeMemoryContext(toState: State, direction: MemoryDirection): void {
    this.#claim.write(toState, { direction, historyIndex: this.#shown });
  }

  #go(delta: number): void {
    if (!Number.isInteger(delta) || delta === 0) {
      return;
    }

    const targetIndex = this.#position() + delta;

    if (targetIndex < 0 || targetIndex >= this.#entries.length) {
      return;
    }

    const entry = this.#entries[targetIndex];
    const currentState = this.#router.getState();
    const direction = delta > 0 ? "forward" : "back";
    const onCurrentPath = entry.path === currentState?.path;

    // "The router is already there" holds only while no restore is in flight:
    // one in flight is about to move it.
    if (onCurrentPath && this.#inFlight === undefined) {
      // Short-circuit: landing on an entry whose path matches the current
      // state skips api.navigateToState. Still rewrite state.context.memory
      // so subscribers see the new historyIndex + direction — otherwise
      // UI animation driven by `direction` sees a stale "navigate" value
      // and `state.context.memory.historyIndex` diverges from the stack
      // until the next full transition (#508).
      this.#shown = targetIndex;
      this.#writeMemoryContext(currentState, direction);

      return;
    }

    const restore: Restore = { targetIndex, direction };
    // navigateToState commits the stored snapshot's values — same primitive
    // every URL-driven flow uses (start, popstate, navigate-event). Skips the
    // `forwardState` seam and its interceptors; route mutations between record
    // and replay do not retroactively change what back/forward commits (#561).
    // Onto the path the router shows, a restore still in flight is superseded
    // only by a navigation, and `force` keeps the same state from being
    // refused.
    const restoreOpts: NavigationOptionsWithSource = {
      replace: true,
      source: MEMORY_RESTORE,
      ...(onCurrentPath && { force: true }),
    };
    // Put back after the call: a restore started inside another one's
    // announce must not take the outer one's place before its navigation is
    // announced.
    const outer = this.#staged;

    this.#staged = restore;

    let promise: Promise<State>;

    try {
      promise = this.#api.navigateToState(entry, restoreOpts);
    } finally {
      this.#staged = outer;
    }

    promise.catch(() => {
      // Reject only: guard block, ROUTE_NOT_FOUND, or cancellation. A newer
      // restore that took over, or a navigation that committed over this one,
      // owns the stack.
      if (this.#inFlight === restore) {
        this.#inFlight = undefined;
      }
    });
  }

  #clear(): void {
    this.#entries.length = 0;
    this.#shown = -1;
    // A restore in flight belongs to the stack that was cleared (#505).
    this.#inFlight = undefined;
  }
}
