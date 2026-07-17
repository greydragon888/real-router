export type {
  RouterSource,
  RouteSnapshot,
  RouteNodeSnapshot,
  ActiveRouteSourceOptions,
  RouterTransitionSnapshot,
  RouterErrorSnapshot,
  DismissableErrorSnapshot,
} from "./types.js";

export { createRouteSource } from "./createRouteSource";

export { createRouteNodeSource } from "./createRouteNodeSource";

export { createActiveRouteSource } from "./createActiveRouteSource";

export { createActiveSource } from "./createActiveSource";

export {
  createTransitionSource,
  getTransitionSource,
} from "./createTransitionSource";

export {
  createErrorSource,
  getErrorSource,
  primeErrorSource,
} from "./createErrorSource";

export { createDismissableError } from "./createDismissableError";

export { createActiveNameSelector } from "./createActiveNameSelector";

export type { ActiveNameSelector } from "./createActiveNameSelector";

export {
  DEFAULT_ACTIVE_OPTIONS,
  normalizeActiveOptions,
} from "./normalizeActiveOptions";

export { canonicalJson } from "./canonicalJson";

export { createRouteEnterGate } from "./createRouteEnterGate";

export type { RouteEnterContext, RouteEnterGate } from "./createRouteEnterGate";

export { guardLeaveListener } from "./guardLeaveListener";

export type {
  RouteExitContext,
  UseRouteExitOptions,
} from "./guardLeaveListener";
