// Public surface intentionally narrow (#740 item 5): `path-matcher` is a private
// internal package, so `index.ts` exports only what consumers (route-tree, core)
// actually use — `SegmentMatcher`, `buildParamMeta`, and the shared types. The
// encoding helpers, `createSegmentNode`, and the standalone `validateConstraints`
// had zero consumers; they remain available to tests via direct `src/*` imports.
//
// `PARAM_NAME_PATTERN` (the single source of truth for the param-name grammar,
// #738) stays defined and exported from `buildParamMeta.ts` for its own in-file
// regex, but is NOT re-exported here: route-tree's gate consumes the shared
// `parseSegment` tokenizer via `findSegmentGrammarError` (#1324), not the raw
// pattern, so the index re-export had no consumer left (#1505).
// `EMPTY_PARAM_META` is the whole-meta shared sentinel for fully-static nodes:
// route-tree's `computeCaches` (the retaining consumer) swaps a fresh all-empty
// result for this instance so a 10k-route static table holds ONE wrapper, not 10k.
export { buildParamMeta, EMPTY_PARAM_META } from "./buildParamMeta";

// The validation-facing entry over the segment tokenizer (#1324): route-tree's
// `validateRoutePath` calls `findSegmentGrammarError` to detect the per-segment
// grammar rejections (name-less / fused-marker / fused-constraint-suffix /
// constraint-in-static / optional-splat / trailing-marker) via the SAME parser the
// matcher uses, so the gate cannot drift from the matcher's grammar. The tokenizer
// primitives (`parseSegment`, `splitPathSegments`) stay internal — only the
// validation entry + its error-code type are public.
export {
  findSegmentGrammarError,
  hasMultipleOptionalsBeforeSplat,
} from "./parseSegment";

export type { SegmentErrorCode } from "./parseSegment";

// `isConstraintBalanced` is the constraint-`<...>` axis counterpart of the
// param-name grammar (#804). route-tree's validation gate consumes it (the balance
// predicate, replacing its former local `hasBalancedConstraints`) + `INVALID_QUERY_NAME_RGX`.
// `CONSTRAINT_BODY_PATTERN` (the atom the internal strip + query-mask regexes derive
// from) stays defined in `constraint-grammar.ts` but is NOT re-exported here: it had
// no consumer outside path-matcher's own src/tests, so the reserved-atom keep from
// #1302 was dropped (#1505). `isConstraintBalanced` is the ONE whole-path constraint
// check left in `registerNode` (a stray `>` is invisible per-segment); every OTHER
// grammar form — empty / fused-suffix / in-static / fused-marker / name-less /
// trailing-marker / optional-splat — is now decided by the shared `parseSegment`
// tokenizer (Реш.2 replaced the former `hasConstraintInStaticSegment` /
// `hasFusedConstraintSuffix` char-scans, now removed).
export {
  INVALID_QUERY_NAME_RGX,
  isConstraintBalanced,
} from "./constraint-grammar";

export { SegmentMatcher } from "./SegmentMatcher";

export type {
  BuildParamSlot,
  BuildPathOptions,
  CompiledRoute,
  ConstraintPattern,
  MatcherInputNode,
  MatchResult,
  ParamMeta,
  ResolvedMatcherOptions,
  SegmentMatcherOptions,
  SegmentNode,
  URLParamsEncodingType,
} from "./types";
