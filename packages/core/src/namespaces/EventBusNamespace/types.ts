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
