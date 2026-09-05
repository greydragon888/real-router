// packages/core/src/namespaces/RouterLifecycleNamespace/RouterLifecycleNamespace.ts

import { errorCodes } from "../../constants";
import { RouterError, freezeThrownError } from "../../RouterError";

import type { RouterLifecycleDependencies } from "./types";
import type { NavigationOptions, State } from "../../types";

const REPLACE_OPTS: NavigationOptions = Object.freeze({ replace: true });

/**
 * Was this failure, at its root, "the route is not there"?
 *
 * ⚑ Asked one level deeper than the code, and that is the whole point. On the
 * synchronous guard walk `handleNavigateError` restates the failure as
 * `TRANSITION_CANCELLED` — the FSM has already left the transition by then, and
 * that predicate is deliberate (#1609 — `handleNavigateError`'s own docstring
 * owns the measurement of the alternative). `asCancellation` attaches the
 * original error WHOLE as `reason`, so the cause survives the restatement and a
 * classifier can read it without touching either #1609's predicate or the
 * two-code contract #1756 documents for `navigate()`.
 *
 * ⚠ Narrow on purpose: a `TRANSITION_CANCELLED` wrapping anything else — a real
 * supersede, a `stop()` — is not a missing route and is rethrown. Measured on
 * the boot arms, a window that stops or disposes the router fails `NOT_STARTED`
 * rather than a wrapped `ROUTE_NOT_FOUND`, so it never reaches here.
 */
function isMissingRoute(error: unknown): boolean {
  // ⚠ Written over the two CANDIDATES rather than as an early-out on
  // `instanceof`: that shape carries a `return false` for a non-`RouterError`
  // the tier cannot reach — nothing in the commit path fails with a plain
  // `Error` — and an unreachable statement under a 100 % gate is a branch to
  // remove, not to `v8 ignore`. Here the same case falls out of the predicate.
  const candidates: unknown[] = [
    error,
    (error as { reason?: unknown } | null | undefined)?.reason,
  ];

  return candidates.some(
    (candidate) =>
      candidate instanceof RouterError &&
      candidate.code === errorCodes.ROUTE_NOT_FOUND,
  );
}

/**
 * Independent namespace for the router's START lifecycle.
 *
 * `start()` is the whole surface, and there is deliberately no `stop()` beside
 * it: stopping is the facade sending `STOP`, whose edge `update`
 * (`clearCurrent`) shifts the committed pair — a namespace method would be a
 * second writer of state the table owns. Lifecycle state is the machine's for
 * the same reason: `isActive()` reads the FSM, this namespace holds no flags.
 */
export class RouterLifecycleNamespace {
  #deps!: RouterLifecycleDependencies;

  // =========================================================================
  // Dependency injection
  // =========================================================================

  /**
   * Sets dependencies for lifecycle operations.
   * Must be called before using lifecycle methods.
   */
  setDependencies(deps: RouterLifecycleDependencies): void {
    this.#deps = deps;
  }

  // =========================================================================
  // Instance methods
  // =========================================================================

  /**
   * Starts the router with the given path.
   *
   * Guards (concurrent start, already started) are handled by the facade via
   * RouterFSM state checks before this method is called.
   */
  async start(startPath: string): Promise<State> {
    const deps = this.#deps;

    // #1185: this method is the start-interceptor target — it runs AFTER the
    // whole interceptor chain. A stop() during that window sent STOP
    // (STARTING → IDLE via the FSM table), so if the router is back at IDLE the
    // start was cancelled mid-window; reject instead of committing a state on a
    // stopped router (mirrors the guard phase, which cancels from
    // TRANSITION_STARTED). `isIdle()` is deliberate — a dispose() mid-window
    // leaves the FSM DISPOSED, which the navigateToState / navigateToNotFound
    // liveness gate rejects as ROUTER_DISPOSED (#1186), not conflated with a
    // cancel.
    if (deps.isIdle()) {
      throw freezeThrownError(new RouterError(errorCodes.TRANSITION_CANCELLED));
    }

    const options = deps.getOptions();

    // Invariant guard (#939): core is platform-agnostic, so the caller must
    // provide a string path. Without a browser-plugin start interceptor to
    // inject a location, a non-string `startPath` (e.g. `start(undefined)`)
    // would otherwise reach matchPath() and throw a cryptic, code-less
    // `TypeError: …codePointAt` deep inside path-matcher. This guard runs AFTER
    // the interceptor chain (browser-plugin substitutes the location upstream),
    // so it only fires when nothing supplied a path — turning the cryptic crash
    // into an actionable error. Symmetric with the subscribe / navigateToNotFound
    // type guards; the validator deliberately permits `undefined` at the facade
    // for exactly the browser-plugin-override case.
    if (typeof startPath !== "string") {
      throw new TypeError(
        `[router.start] path must be a string, got ${typeof startPath}`,
      );
    }

    const matchedState = deps.matchPath(startPath);

    if (!matchedState && !options.allowNotFound) {
      const err = new RouterError(errorCodes.ROUTE_NOT_FOUND, {
        path: startPath,
      });

      // No report is emitted here, deliberately. `#unwindFailedStart` already
      // sends FAIL for a start that threw while STARTING, and that is the edge
      // which names no navigation — the two sibling refusals above (the
      // cancelled-mid-window one and the path type guard) have always relied on
      // it. Reporting here as well put a SECOND navigation-less FAIL on the
      // table, and once the machine had moved on it landed on an in-band edge
      // and stole it from a live navigation.
      throw freezeThrownError(err);
    }

    deps.completeStart();

    if (matchedState) {
      // navigateToState commits matchedState's VALUES — same primitive URL
      // plugins use on popstate / navigate-event (#525). Keeps trailing-slash
      // and any other source-URL flavor that matchPath produced; skips the
      // redundant forwardState+buildPath round-trip in buildNavigateState.
      //
      // ⚑ The match above ran BEFORE `completeStart()`, and `completeStart()` is
      // what opens the second boot window — a plugin's `onStart`, a raw `$start`
      // listener. Route-CRUD is ungated there (`isTransitioning()` is `false`),
      // so `matchedState` can be a stale object by the time it is committed, and
      // the commit then fails on a route that no longer exists (#1750).
      //
      // The owner's decision for that window is DEGRADE, not gate: the mutation
      // the application asked for applies, and the boot reports the consequence
      // through the channel the caller already handles. Under `allowNotFound`
      // that channel is the router's own not-found state — the same answer a URL
      // matching nothing gets, and the same thing `replace()` does on a RUNNING
      // router when it drops the route the user is on (#950 / #1201).
      //
      // ⚠ The `instanceof` is the TYPE narrowing, not a runtime term: `error` is
      // `unknown`, and without it `error.code` does not compile. It is redundant
      // at runtime — anything that is not a `RouterError` has no matching `code`
      // and rethrows on the next clause anyway — so no test pins it and removing
      // it leaves the whole tier green. What it reds is `type-check`. Named here
      // because a silent redundancy reads as a guard that guards nothing.
      //
      // ⚑ `options` is read once at the top of this method and the window cannot
      // change it: the options object is frozen per instance and `allowNotFound`
      // sits on it, so a write from
      // `onStart` throws (measured). The gate therefore reads the value the
      // CALLER configured, not one the boot window could have flipped under it.
      //
      // ⚑ And the fallback cannot swap the reported failure. Measured on the four
      // arms where the window stops or disposes the router: every one of them
      // fails `NOT_STARTED`, never `ROUTE_NOT_FOUND`, so they are rethrown
      // untouched and `navigateToNotFound` is not reached. The pairing that would
      // matter — `ROUTE_NOT_FOUND` on a router the window already stopped — is
      // unreachable through them, and the widening that would reach it is pinned
      // by the `CANNOT_ACTIVATE` cell.
      //
      // ⚠ Narrow deliberately, on BOTH runtime terms. Without `allowNotFound` there is
      // no state to degrade into and the rejection is correct, so the option the
      // caller already chose decides. And only `ROUTE_NOT_FOUND` is caught: a
      // guard refusing the boot, a cancellation or a plugin throwing are other
      // failures and keep their codes.
      //
      // ⚑ Window ONE needs nothing here and never did: it runs before
      // `matchPath`, so a wipe there leaves no match at all and the
      // `allowNotFound` branch below has always taken over. The two windows
      // disagreed for that reason alone.
      // ⚠ `try`/`await`, not `.catch()`: the collaborator is declared
      // `State | Promise<State>` and the guard-free boot really does take the
      // synchronous arc (cut A, #1588), where a bare `State` comes back and
      // has no `.catch`. The CONTROL cell for an untouched boot is what caught
      // that — the defective form passed both windows and reds only there.
      try {
        return await deps.navigateToState(matchedState, REPLACE_OPTS);
      } catch (error) {
        if (!options.allowNotFound || !isMissingRoute(error)) {
          throw error;
        }

        return deps.navigateToNotFound(startPath);
      }
    }

    return deps.navigateToNotFound(startPath);
  }
}
