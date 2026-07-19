/**
 * Search Params Module.
 *
 * Query string parsing and building with configurable strategies.
 *
 * @module search-params
 */

export { build, parseQuery } from "./searchParams";

export { DEFAULT_QUERY_PARAMS } from "./encode";

export type {
  ArrayFormat,
  BooleanFormat,
  DecodeResult,
  FinalOptions,
  NullFormat,
  NumberFormat,
  Options,
  QueryParamPrimitive,
  QueryParamValue,
  SearchParams,
} from "./types";
