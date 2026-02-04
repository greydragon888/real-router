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
  caseSensitive: false,
  urlParamsEncoding: "default",
  allowNotFound: true,
  rewritePathOnMatch: true,
  noValidate: false,
} satisfies Options;

/**
 * Valid values for string enum options.
 * Used for runtime validation in setOption/withOptions.
 */
export const VALID_OPTION_VALUES = {
  trailingSlash: ["strict", "never", "always", "preserve"] as const,
  queryParamsMode: ["default", "strict", "loose"] as const,
  urlParamsEncoding: ["default", "uri", "uriComponent", "none"] as const,
} as const;

/**
 * Valid keys and values for queryParams option.
 */
export const VALID_QUERY_PARAMS = {
  arrayFormat: ["none", "brackets", "index", "comma"] as const,
  booleanFormat: ["none", "string", "empty-true"] as const,
  nullFormat: ["default", "hidden"] as const,
} as const;

/**
 * Options that can be changed after router is locked (started).
 */
export const UNLOCKED_OPTIONS = new Set<keyof Options>([
  "defaultRoute",
  "defaultParams",
]);
