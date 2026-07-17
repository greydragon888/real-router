// packages/core/src/namespaces/EventBusNamespace/types.ts

import type { RouterEvent, RouterPayloads, RouterState } from "../../fsm";
import type { RouterEventMap } from "../../types";
import type { FSM } from "@real-router/fsm";
import type { EventEmitter } from "event-emitter";

export interface EventBusOptions {
  routerFSM: FSM<RouterState, RouterEvent, null, RouterPayloads>;
  emitter: EventEmitter<RouterEventMap>;
  /**
   * Aborts the in-flight navigation's `AbortController` — the **effect** of the
   * FSM `CANCEL` action (RFC navigation-cancellation-unification §5).
   * Wired to `NavigationNamespace.abortCurrentController` so "FSM `CANCEL` ⟹
   * controller aborted (+ pipeline woken)" holds in one place. `reason` becomes
   * the controller's `signal.reason` (#943).
   */
  abortController: (reason?: unknown) => void;
}
