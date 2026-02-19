// packages/core/src/fsm/index.ts

export { createRouterFSM, routerStates, routerEvents } from "./routerFSM";

export {
  createTransitionFSM,
  transitionStates,
  transitionEvents,
} from "./transitionFSM";

export type { RouterEvent, RouterPayloads, RouterState } from "./routerFSM";

export type {
  TransitionEvent,
  TransitionPayloads,
  TransitionFSMState,
} from "./transitionFSM";
