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
