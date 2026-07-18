// packages/core/src/namespaces/OptionsNamespace/constants.ts

import { DEFAULT_QUERY_PARAMS } from "../../engine";

import type { Options } from "../../types";

/**
 * Default options for the router.
 */
export const defaultOptions: Options = {
  defaultRoute: "",
  defaultParams: {},
  trailingSlash: "preserve",
  caseSensitive: true,
  queryParamsMode: "loose",
  queryParams: DEFAULT_QUERY_PARAMS,
  urlParamsEncoding: "default",
  allowNotFound: true,
  rewritePathOnMatch: true,
} satisfies Options;
