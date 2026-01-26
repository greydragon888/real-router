// packages/router-benchmarks/src/helpers/index.ts

export { do_not_optimize } from "mitata";

export { createRouter, cloneRouter } from "./router-adapter";

export { ROUTER_NAME, IS_ROUTER5, UNIFIED_OPTIONS } from "./constants";

export type { Route, Router } from "@real-router/core";

export { createSimpleRouter, createNestedRouter } from "./create-router";
