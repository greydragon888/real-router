import { errorCodes } from "../../constants";
import { RouterError } from "../../RouterError";

/**
 * The `AbortController` of the navigation in flight — one slot, adopted and
 * released.
 *
 * Naming this sub-domain is what let the orchestration around it become
 * functions over `(deps, plan)`: the behaviour has no other mutable state to
 * drag along (#1607).
 *
 * ⚑ **The supersession token is GONE (#1664).** This class used to carry a
 * counter beside the controller, and `isCurrent(id)` answered "am I still the
 * navigation in flight?" — the very question the machine answers about the very
 * same navigation, by comparing the plan it adopted on `NAVIGATE`. Two counters
 * for one fact, able to disagree in the window between them. The pipeline now
 * asks the machine (`deps.isCurrentNavigation(plan)`), and what is left here is
 * the one thing the machine does not own: a controller to abort.
 *
 * **One instance per ROUTER, not per navigation.** The controller is a single
 * slot, so nothing here allocates on the hot path.
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

    // Stryker disable next-line ConditionalExpression,EqualityOperator,BlockStatement: equivalent — controller identity-guard; cleanup correctness is enforced by the supersede path + the machine's own `isCurrentNavigation` checks. Full suite stays green with `=== → !==` (nulls the wrong controller) and with the body removed (ref never nulled), so no mutant here is observable.
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
