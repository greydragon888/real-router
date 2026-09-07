/**
 * Search Params Module.
 *
 * Query string parsing and building with configurable strategies.
 *
 * @module search-params
 */

export { build, buildWith, parseQuery, parseQueryWith } from "./searchParams";

export { DEFAULT_QUERY_PARAMS, makeOptions } from "./encode";

export type {
  ArrayFormat,
  BooleanFormat,
  NumberFormat,
  Options,
  SearchParams,
} from "./types";
