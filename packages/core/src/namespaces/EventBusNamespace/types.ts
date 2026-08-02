// packages/core/src/namespaces/EventBusNamespace/types.ts

import type {
  RouterEvent,
  RouterFSMContext,
  RouterPayloads,
  RouterState,
} from "../../routerFSM";
import type { State } from "../../types";
import type { RouterEventMap } from "../../types/internal";
import type { EventEmitter } from "../../utils/event-emitter";
import type { FSM } from "../../utils/fsm";

export interface EventBusOptions {
  routerFSM: FSM<RouterState, RouterEvent, RouterFSMContext, RouterPayloads>;
  emitter: EventEmitter<RouterEventMap>;
  /**
   * Aborts the in-flight navigation's `AbortController` — the **effect** of the
   * FSM `CANCEL` action (RFC navigation-cancellation-unification §5).
   * Wired to `NavigationNamespace.abortCurrentController` so "FSM `CANCEL` ⟹
   * controller aborted (+ pipeline woken)" holds in one place. `reason` becomes
   * the controller's `signal.reason` (#943).
   */
  abortController: (reason?: unknown) => void;
  /**
   * Writes the committed state — the **effect** of the FSM `SYSTEM_COMMIT`
   * action, injected exactly like {@link abortController} is for `CANCEL`. The
   * machine owns "when a system commit is announced"; this is how it performs
   * the write that goes with it, without the event bus knowing about
   * `StateNamespace`.
   */
  commitState: (state: State) => void;
}
