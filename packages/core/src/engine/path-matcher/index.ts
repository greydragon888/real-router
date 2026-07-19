// Public surface intentionally narrow (#740 item 5): `path-matcher` is a private
// internal package, so `index.ts` exports only what consumers (route-tree, core)
// actually use — `SegmentMatcher`, `buildParamMeta`, and the shared types. The
// encoding helpers and `createSegmentNode` have zero consumers; they remain
// available to tests via direct `src/*` imports.
//
// `EMPTY_PARAM_META` is the whole-meta shared sentinel for fully-static nodes:
// route-tree's `computeCaches` (the retaining consumer) swaps a fresh all-empty
// result for this instance so a 10k-route static table holds ONE wrapper, not 10k.
// `INVALID_QUERY_NAME_RGX` (a query-param name may not carry `<`/`>`, #1242 §5.1)
// lives with query extraction here after M1 removed constraints; the route-tree
// gate consumes it (the matcher backstop imports it directly).
export {
  buildParamMeta,
  EMPTY_PARAM_META,
  INVALID_QUERY_NAME_RGX,
} from "./buildParamMeta";

// The validation-facing entries over the segment tokenizer (3-token grammar, M1):
// route-tree's `validateRoutePath` calls `findSegmentGrammarError` to detect the
// per-segment grammar rejections (name-less / fused-marker / trailing-marker /
// optional-removed / constraint-removed) via the SAME parser the matcher uses, so
// the gate cannot drift; `describeRemovedForm` gives it the offending segment +
// sibling paths for the removed-form replacement recipe. The tokenizer primitives
// (`parseSegment`, `splitPathSegments`) stay internal — only the validation
// entries + their types are public.
export { describeRemovedForm, findSegmentGrammarError } from "./parseSegment";

export type { RemovedForm, SegmentErrorCode } from "./parseSegment";

export { SegmentMatcher } from "./SegmentMatcher";

export type {
  BuildParamSlot,
  BuildPathOptions,
  CompiledRoute,
  MatcherInputNode,
  MatchResult,
  ParamMeta,
  ResolvedMatcherOptions,
  SegmentMatcherOptions,
  SegmentNode,
  URLParamsEncodingType,
} from "./types";
