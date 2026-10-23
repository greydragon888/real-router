import { events } from "@real-router/core";

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

/** The wait a cancelled restore takes (`#waitFor`). */
interface Wait {
  readonly restore: Restore;
  readonly stop: () => void;
  // A look is queued, and the restore's rejection waits for it.
  looking: boolean;
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
  // The restore whose navigation was announced last, until it lands, another
  // navigation commits over it, its rejection (`#left`) or its wait
  // (`#waitFor`) drops it, or the stack is cleared.
  #inFlight: Restore | undefined;
  // The context of the navigation announced last, until it is refused or
  // cancelled.
  #running: object | undefined;
  // The context of the last navigation refused or cancelled while it ran.
  #ranLast: object | undefined;
  // The navigations refused or cancelled: a listener the router calls before
  // this plugin's can end one inside its announce.
  readonly #ends = new WeakSet<object>();
  // The last wait `#waitFor` took, which `#left` and `#clear` stop.
  #waiting: Wait | undefined;
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
        const context = toState.context;

        // Ended inside its announce: it neither runs nor moves the stack.
        if (this.#ends.has(context)) {
          return;
        }

        this.#running = context;

        if (restore !== undefined) {
          this.#staged = undefined;
          this.#restores.set(context, restore);
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

      onTransitionError: (toState: State | undefined) => {
        this.#ended(toState);
      },

      onTransitionCancel: (toState: State) => {
        this.#ended(toState);
        this.#cancelled(toState);
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
   * announced, and stops moving it when that navigation's rejection (`#left`)
   * or the end of the navigations it waits for (`#waitFor`) drops it — so a
   * refusal leaves nothing to undo, whenever and however it comes (#1803).
   */
  #position(): number {
    return this.#inFlight?.targetIndex ?? this.#shown;
  }

  /**
   * A navigation the router refused or cancelled: once it is the one announced
   * last, none runs.
   */
  #ended(toState: State | undefined): void {
    if (toState === undefined) {
      return;
    }

    const context = toState.context;

    this.#ends.add(context);

    // A refusal before a navigation starts carries a context of its own.
    if (context === this.#running) {
      this.#running = undefined;
      this.#ranLast = context;
    }
  }

  /**
   * A navigation the router cancelled. When it is the restore in flight's, a
   * navigation that runs from now decides in its place — the one that cancels
   * it, which starts within the same call and can end there, or one started
   * before the wait decides — so the restore waits from now (`#waitFor`).
   */
  #cancelled(toState: State): void {
    const restore = this.#inFlight;

    if (
      restore !== undefined &&
      this.#restores.get(toState.context) === restore
    ) {
      this.#waitFor(restore);
    }
  }

  /**
   * The rejection of `restore`'s navigation. A refused restore stops moving
   * the stack, as a refused traversal returns (#2740). So does a cancelled
   * one, unless its wait decides in its place (`#waits`, #2802). A restore no
   * longer in flight — landed, committed over, taken over, dropped by its wait
   * or cleared with the stack — is left alone.
   */
  #left(restore: Restore): void {
    if (this.#inFlight !== restore || this.#waits(restore)) {
      return;
    }

    this.#inFlight = undefined;
    this.#waiting?.stop();
  }

  /**
   * Whether `restore`'s wait decides in place of its rejection: a navigation
   * runs — the one that superseded it, or one started since — whose end
   * decides, or a look of the wait is queued. Only a restore the router
   * cancelled has a wait.
   */
  #waits(restore: Restore): boolean {
    const wait = this.#waiting;

    return (
      wait?.restore === restore && (this.#running !== undefined || wait.looking)
    );
  }

  /**
   * Keeps `restore` moving the stack while a navigation runs, until none does.
   * Taken at the restore's cancel, so its listeners come after the ones an
   * application registered before then. Each end of a navigation that ran
   * looks a microtask later — a refusal before a navigation starts ends none,
   * as for the watch the URL plugins keep — unless a later end comes before
   * its look runs: of the ends within one call, the last looks, after the
   * microtasks those listeners queued for all of them, so a redirect one of
   * those defers is newer still, and before the handlers of the ended
   * navigation's own promise. The restore's rejection leaves the decision to
   * a look still queued. A commit applies to the entry the restore moves to
   * (#1234). A router that refuses a listener leaves the restore to its
   * rejection, holding none.
   */
  #waitFor(restore: Restore): void {
    const removers: (() => void)[] = [];
    let looks = 0;
    const stop = (): void => {
      for (const remove of removers) {
        remove();
      }
    };
    const wait: Wait = { restore, stop, looking: false };
    const settle = (): void => {
      if (this.#inFlight === restore) {
        // The end was another navigation's, and the newer one decides.
        if (this.#running !== undefined) {
          return;
        }

        this.#inFlight = undefined;
      }

      stop();
    };
    const look = (): void => {
      const generation = ++looks;

      wait.looking = true;
      queueMicrotask(() => {
        // A later end looks itself.
        if (generation === looks) {
          wait.looking = false;
          settle();
        }
      });
    };
    // The plugin's hooks (`#ended`) run before these listeners on each end.
    const lookIfItRan = (toState: State | undefined): void => {
      if (toState?.context === this.#ranLast) {
        look();
      }
    };
    const listeners = [
      () => this.#api.addEventListener(events.TRANSITION_SUCCESS, look),
      () => this.#api.addEventListener(events.TRANSITION_ERROR, lookIfItRan),
      () => this.#api.addEventListener(events.TRANSITION_CANCEL, lookIfItRan),
    ];

    try {
      for (const listen of listeners) {
        removers.push(listen());
      }
    } catch {
      stop();

      return;
    }

    this.#waiting = wait;
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
      this.#left(restore);
    });
  }

  #clear(): void {
    this.#entries.length = 0;
    this.#shown = -1;
    // A restore in flight belongs to the stack that was cleared (#505).
    this.#inFlight = undefined;
    this.#waiting?.stop();
  }
}
