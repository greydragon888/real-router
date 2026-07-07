// Public surface intentionally narrow (#740 item 5): `path-matcher` is a private
// internal package, so `index.ts` exports only what consumers (route-tree, core)
// actually use — `SegmentMatcher`, `buildParamMeta`, `PARAM_NAME_PATTERN`, and the
// shared types. The encoding helpers, `createSegmentNode`, and the standalone
// `validateConstraints` had zero consumers; they remain available to tests via
// direct `src/*` imports.
//
// `PARAM_NAME_PATTERN` is the single source of truth for the param-name grammar
// (#738); route-tree's `validateRoutePath` derives its name-less-marker gate from
// it (#863) so the validation layer cannot drift from the matcher's own grammar.
export { buildParamMeta, PARAM_NAME_PATTERN } from "./buildParamMeta";

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

// `CONSTRAINT_BODY_PATTERN` + `isConstraintBalanced` are the constraint-`<...>`
// axis counterpart of `PARAM_NAME_PATTERN` (#804). route-tree's validation gate
// consumes `isConstraintBalanced` (the balance predicate, replacing its former
// local `hasBalancedConstraints`) + `INVALID_QUERY_NAME_RGX`. `CONSTRAINT_BODY_PATTERN`
// (the atom the internal strip + query-mask regexes derive from) has NO external
// consumer — kept exported as a reserved constraint-grammar atom so the `<...>`
// grammar stays single-sourced. `isConstraintBalanced` is the ONE whole-path
// constraint check left in `registerNode` (a stray `>` is invisible per-segment);
// every OTHER grammar form — empty / fused-suffix / in-static / fused-marker /
// name-less / trailing-marker / optional-splat — is now decided by the shared
// `parseSegment` tokenizer (Реш.2 replaced the former `hasConstraintInStaticSegment`
// / `hasFusedConstraintSuffix` char-scans, now removed).
export {
  CONSTRAINT_BODY_PATTERN,
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
