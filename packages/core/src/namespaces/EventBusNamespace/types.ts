// packages/core/src/namespaces/EventBusNamespace/types.ts

import type { RouterEvent, RouterPayloads, RouterState } from "../../fsm";
import type { RouterEventMap } from "../../types";
import type { FSM } from "@real-router/fsm";
import type { EventEmitter } from "event-emitter";

export interface EventBusOptions {
  routerFSM: FSM<RouterState, RouterEvent, null, RouterPayloads>;
  emitter: EventEmitter<RouterEventMap>;
}
