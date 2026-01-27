// packages/core/src/namespaces/index.ts

export {
  DependenciesNamespace,
  DEPENDENCY_LIMITS,
} from "./DependenciesNamespace";

export {
  invokeFor,
  MAX_EVENT_DEPTH,
  MAX_LISTENERS_HARD_LIMIT,
  ObservableNamespace,
  validEventNames,
} from "./ObservableNamespace";

export type { EventMethodMap } from "./ObservableNamespace";

export {
  deepFreeze,
  defaultOptions,
  optionNotFoundError,
  OptionsNamespace,
  UNLOCKED_OPTIONS,
  VALID_OPTION_VALUES,
  VALID_QUERY_PARAMS,
} from "./OptionsNamespace";

export { StateNamespace } from "./StateNamespace";
