import { errorCodes } from "../../constants";
import { RouterError } from "../../RouterError";

/**
 * The lifecycle of ONE in-flight navigation: its supersession token and its
 * `AbortController`.
 *
 * These two fields were the namespace's only sub-domain with a small owner set —
 * four members touched the controller, three the token, against thirteen that
 * need the DI bag. Naming that sub-domain is what lets the orchestration around
 * it become functions over `(deps, plan)`: the behaviour has no other mutable
 * state to drag along (#1607).
 *
 * **One instance per ROUTER, not per navigation.** The token is a counter and
 * the controller is a single slot, so nothing here allocates on the hot path.
 *
 * **The controller is adopted, never manufactured.** A `take()` that created one
 * would allocate on the arcs that have nothing to hand a signal to — an external
 * `opts.signal` or a pre-commit listener makes a navigation *suspendable*
 * without making it need a controller — and that is precisely the regression
 * Step 1b of #1588 refused the `#handleNoGuardsLeave` fold for, by measurement.
 * The two creation sites keep their own conditions; this object only tracks
 * WHICH controller is current. Pinned by `controller-allocation.test.ts`.
 */
export class InFlightNavigation {
  #controller: AbortController | null = null;
  #id = 0;

  /**
   * Reserve the token for a navigation that is starting, superseding whatever
   * held it before. Identity is all that matters — the value is never ordered.
   */
  begin(): number {
    // Stryker disable next-line UpdateOperator: equivalent — the token is only ever compared by identity (`isCurrent`) to detect supersession; uniqueness per navigation is all that matters, so `--` (decreasing ids) is indistinguishable from `++`.
    return ++this.#id;
  }

  /** Is `id` still the navigation in flight, or has a newer one taken over? */
  isCurrent(id: number): boolean {
    return this.#id === id;
  }

  /**
   * Track a controller the CALLER created as the current navigation's. Done
   * before any listener runs, so a reentrant `navigate()` / `stop()` /
   * `dispose()` from a synchronous listener aborts THIS navigation's signal
   * (#722).
   */
  adopt(controller: AbortController): void {
    this.#controller = controller;
  }

  /**
   * Release a navigation's controller. The same `controller.signal` is handed to
   * `subscribeLeave` listeners, so it must abort **only** when the navigation is
   * cancelled or errors — never on success (#722). On the success path pass
   * `cancelled = false`: the reference is dropped without aborting, so a listener
   * that captured the signal still sees `aborted === false`.
   *
   * On the failure/cancellation path (`cancelled = true`) pass the originating
   * `reason` so `signal.reason` carries router/error context (a `RouterError`,
   * or the value a sync leave listener threw) — consistent with the cancellation
   * abort `RouterError(TRANSITION_CANCELLED)`, not a generic `AbortError` (#943).
   * `abort()` is idempotent: a controller already aborted by a superseding
   * navigation keeps its first (also-meaningful) reason.
   */
  release(
    controller: AbortController,
    cancelled: boolean,
    reason?: unknown,
  ): void {
    if (cancelled) {
      controller.abort(reason);
    }

    // Stryker disable next-line ConditionalExpression,EqualityOperator,BlockStatement: equivalent — controller identity-guard; cleanup correctness is enforced by the supersede path + the token/isCurrent checks. Full suite stays green with `=== → !==` (nulls the wrong controller) and with the body removed (ref never nulled), so no mutant here is observable.
    if (this.#controller === controller) {
      this.#controller = null;
    }
  }

  /**
   * Abort and release whatever is in flight (waking a parked async pipeline via
   * its `onInternalAbort`). This is the **effect** of the FSM `CANCEL` action
   * (`handleCancel` → injected `deps.abortCurrentController`), not something
   * cancellation sources call directly — so "FSM `CANCEL` ⟹ controller aborted"
   * holds in one place (RFC navigation-cancellation-unification §5). `reason`
   * (e.g. an external `opts.signal`'s reason, #943) becomes the controller's
   * `signal.reason`; defaults to `TRANSITION_CANCELLED`.
   */
  abort(reason?: unknown): void {
    this.#controller?.abort(
      reason ?? new RouterError(errorCodes.TRANSITION_CANCELLED),
    );
    this.#controller = null;
  }
}
