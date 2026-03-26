// packages/core/src/namespaces/OptionsNamespace/constants.ts

import type { Options } from "@real-router/types";

/**
 * Default options for the router.
 */
export const defaultOptions: Options = {
  defaultRoute: "",
  defaultParams: {},
  trailingSlash: "preserve",
  queryParamsMode: "loose",
  queryParams: {
    arrayFormat: "none",
    booleanFormat: "none",
    nullFormat: "default",
  },
  urlParamsEncoding: "default",
  allowNotFound: true,
  rewritePathOnMatch: true,
} satisfies Options;
