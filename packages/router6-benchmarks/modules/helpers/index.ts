// packages/real-router-benchmarks/modules/helpers/index.ts

export { do_not_optimize } from "mitata";

export { createRouter, cloneRouter, UNIFIED_OPTIONS } from "./router-adapter";

export type { Route, Router } from "router6";

export {
  createSimpleRouter,
  createNestedRouter,
  createFlatRouter,
} from "./create-router";
