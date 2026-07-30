// packages/core/src/namespaces/OptionsNamespace/constants.ts

import { DEFAULT_QUERY_PARAMS } from "../../engine";

import type { Options } from "../../types";

/**
 * Default options for the router.
 */
// No explicit `: Options` annotation — that would widen every field to the
// union `Options<DefaultDependencies>` declares, including the CALLBACK arm of
// `defaultRoute` / `defaultParams` / `defaultSearch`. `Options` is generic over
// the dependency map now, and a callback typed against `object` does not flow
// into an `Options<Deps>`. `satisfies` keeps the check while letting the
// inferred (callback-free) literal types stay assignable to any instantiation.
export const defaultOptions = {
  defaultRoute: "",
  defaultParams: {},
  defaultSearch: {},
  trailingSlash: "preserve",
  caseSensitive: true,
  queryParamsMode: "loose",
  queryParams: DEFAULT_QUERY_PARAMS,
  urlParamsEncoding: "default",
  allowNotFound: true,
  rewritePathOnMatch: true,
} satisfies Options;
