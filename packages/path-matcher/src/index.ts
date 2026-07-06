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

// `CONSTRAINT_BODY_PATTERN` + `isConstraintBalanced` are the constraint-`<...>`
// axis counterpart of `PARAM_NAME_PATTERN` (#804). `isConstraintBalanced` (the
// balance predicate) is the one route-tree's validation gate consumes — replacing
// route-tree's former local `hasBalancedConstraints`. `CONSTRAINT_BODY_PATTERN` (the
// atom every *internal* match/strip/build regex here derives from) is exported as a
// reserved/future constraint-grammar atom: it currently has NO external consumer
// (route-tree consumes `isConstraintBalanced` + `hasConstraintInStaticSegment`),
// kept exported so the `<...>` grammar stays single-sourced from this package.
export {
  CONSTRAINT_BODY_PATTERN,
  hasConstraintInStaticSegment,
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
