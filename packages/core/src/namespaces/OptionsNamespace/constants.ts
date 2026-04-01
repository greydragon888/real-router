// packages/core/src/namespaces/OptionsNamespace/constants.ts

import { DEFAULT_QUERY_PARAMS } from "route-tree";

import type { Options } from "@real-router/types";

/**
 * Default options for the router.
 */
export const defaultOptions: Options = {
  defaultRoute: "",
  defaultParams: {},
  trailingSlash: "preserve",
  queryParamsMode: "loose",
  queryParams: DEFAULT_QUERY_PARAMS,
  urlParamsEncoding: "default",
  allowNotFound: true,
  rewritePathOnMatch: true,
} satisfies Options;
