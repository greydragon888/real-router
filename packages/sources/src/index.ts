export type {
  RouterSource,
  RouteSnapshot,
  RouteNodeSnapshot,
  ActiveRouteSourceOptions,
  RouterTransitionSnapshot,
  RouterErrorSnapshot,
} from "./types.js";

export { createRouteSource } from "./createRouteSource";

export { createRouteNodeSource } from "./createRouteNodeSource";

export { createActiveRouteSource } from "./createActiveRouteSource";

export {
  createTransitionSource,
  getTransitionSource,
} from "./createTransitionSource";

export { createErrorSource, getErrorSource } from "./createErrorSource";

export {
  DEFAULT_ACTIVE_OPTIONS,
  normalizeActiveOptions,
} from "./normalizeActiveOptions";

export { canonicalJson } from "./canonicalJson";
