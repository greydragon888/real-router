// packages/type-guards/modules/guards/index.ts

// Re-export all type guards from guards/ directory

export { isNavigationOptions } from "./navigation";

export { isRouteName } from "./routes";

export { isState, isStateStrict, isHistoryState } from "./state";

// Re-export from primitives and params (now in guards/ directory)
export {
  isString,
  isBoolean,
  isPromise,
  isObjKey,
  isPrimitiveValue,
} from "./primitives";

export { isParams, isParamsStrict } from "./params";
