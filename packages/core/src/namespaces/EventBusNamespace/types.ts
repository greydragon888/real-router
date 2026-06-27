// packages/core/src/namespaces/EventBusNamespace/types.ts

import type { RouterEvent, RouterPayloads, RouterState } from "../../fsm";
import type { RouterEventMap } from "../../types";
import type { FSM } from "@real-router/fsm";
import type { EventEmitter } from "event-emitter";

export interface EventBusOptions {
  routerFSM: FSM<RouterState, RouterEvent, null, RouterPayloads>;
  emitter: EventEmitter<RouterEventMap>;
  /**
   * Same per-listener error sink the `emitter` reports synchronous throws
   * through. The `subscribe` wrapper routes an **async** listener's rejected
   * Promise here so a fire-and-forget rejection is isolated, not leaked as a
   * Node `unhandledRejection` (#944).
   */
  onListenerError: (eventName: string, error: unknown) => void;
}
