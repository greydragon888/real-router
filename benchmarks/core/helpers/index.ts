// benchmarks/core/helpers/index.ts

export { do_not_optimize } from "mitata";

export { createRouter, getPluginApi, getRoutesApi } from "./router-adapter";

export {
  ROUTER_NAME,
  IS_ROUTER5,
  IS_ROUTER6,
  IS_REAL_ROUTER,
  UNIFIED_OPTIONS,
} from "./constants";

export type { Route, Router } from "@real-router/core";

export { createSimpleRouter, createNestedRouter } from "./create-router";
