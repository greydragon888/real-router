// packages/core/src/namespaces/EventBusNamespace/types.ts

import type {
  RouterEvent,
  RouterFSMContext,
  RouterPayloads,
  RouterState,
} from "../../routerFSM";
import type { RouterEventMap } from "../../types/internal";
import type { EventEmitter } from "../../utils/event-emitter";
import type { FSM } from "../../utils/fsm";

export interface EventBusOptions {
  routerFSM: FSM<RouterState, RouterEvent, RouterFSMContext, RouterPayloads>;
  emitter: EventEmitter<RouterEventMap>;
}

declare const SCOPE_DECIDED: unique symbol;

/**
 * Proof that the cancellability scope was DECIDED before the transition was
 * announced (#1724).
 *
 * The `NAVIGATE` action does two things in order: it settles whether this
 * navigation gets a bridge onto the caller's `AbortSignal`, and then it
 * announces the transition. The order is the whole point — `addEventListener`
 * does not fire retroactively, so a signal that aborts from inside the announce
 * (a plugin's `onTransitionStart`, measured: 4 times across the tier) reaches
 * nobody if the decision is taken afterwards. The failure is silent: the
 * navigation still commits, no `TRANSITION_CANCEL` is emitted, and the band sits
 * in `LEAVE_APPROVED` until something else moves it (#1030 / #1684).
 *
 * So the order is expressed in the TYPE rather than in a comment: the announce
 * demands this proof, the proof exists only as the decision's result, and a
 * `const` cannot be read above its own declaration — announcing first is
 * `TS2448`, not a red test. The symbol is never exported, so the brand cannot be
 * forged outside this module.
 *
 * ⚠ It proves the decision HAPPENED, not that a bridge stands: "no bridge is
 * needed here" is a decision too, and the guard-free, listener-free arc takes
 * exactly that branch. Reading it as "a bridge exists" is the one misuse the
 * type cannot prevent.
 *
 * Same shape as `CommitPermit` in `NavigationNamespace/types.ts`, which locks
 * the ask/cleanup order in `completeTransition` for the same reason: the mistake
 * had been made twice, and a pin only speaks after the fact.
 */
export interface ScopeDecision {
  readonly [SCOPE_DECIDED]: true;
}

/**
 * The one decision token in the process. The brand is erased at runtime, so it
 * carries no information — its whole job is to exist only where the scope's fate
 * has already been settled. Module-level because it is a token, not a value: a
 * fresh object per navigation would allocate on the #307 hot path for nothing.
 */
export const SCOPE_DECIDED_TOKEN = {} as ScopeDecision;
