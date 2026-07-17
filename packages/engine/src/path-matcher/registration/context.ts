// Shared registration context: the `RegistrationState` interface, the frozen
// empty-value sentinels (#1009), and the constraint-strip regex. Leaf module (no
// sibling imports) so `trie`/`trieNodes`/`buildParts` can depend on `RegistrationState`
// without cycling back to the orchestrator.

import { CONSTRAINT_BODY_PATTERN } from "../constraint-grammar";

import type {
  BuildParamSlot,
  CompiledRoute,
  ConstraintPattern,
  ResolvedMatcherOptions,
  SegmentNode,
} from "../types";

// Shared frozen sentinels for the no-params/-constraints common case — avoid a
// fresh empty Set/Map/array per route (#1009). All are ReadonlySet/Map/[] and
// read-only on the match/build hot paths.
export const EMPTY_STRINGS: readonly string[] = Object.freeze([]);

// #1240 §5: freeze the Set/Map shells too, so the "Shared frozen sentinels" claim
// above holds for ALL of them and the #1009 sentinels are consistent with route-tree's
// frozen `EMPTY_CHILDREN_MAP`. `Object.freeze` locks only the shell (not `.add`/`.set`
// — see route-tree INVARIANTS CC1), but these are `Readonly`-typed and never mutated.
export const EMPTY_STRING_SET: ReadonlySet<string> = Object.freeze(
  new Set<string>(),
);

export const EMPTY_CONSTRAINTS: ReadonlyMap<string, ConstraintPattern> =
  Object.freeze(new Map<string, ConstraintPattern>());

export const EMPTY_PARAM_SLOTS: readonly BuildParamSlot[] = Object.freeze([]);

export const EMPTY_PARAMS: Readonly<Record<string, unknown>> = Object.freeze(
  {},
);

// Shared frozen sentinel for a route whose every segment has an empty
// paramTypeMap (all-static chain): `buildMeta` returns this instead of a fresh
// per-route `{ [fullName]: {} }` record — with N distinct route names those
// records degrade into N dictionary-mode objects (route-unique keys) while
// carrying zero information. Consumers do keyed lookups (`meta[name]`) and
// treat a missing entry as "no params", so empty-entry ≡ missing-entry; the
// sentinel stays truthy for the route-found check in core's buildNavigateState.
export const EMPTY_ROUTE_META: Readonly<
  Record<string, Record<string, "url" | "query">>
> = Object.freeze({});

export interface RegistrationState {
  readonly root: SegmentNode;
  readonly options: ResolvedMatcherOptions;
  readonly routesByName: Map<string, CompiledRoute>;
  readonly staticCache: Map<string, CompiledRoute>;
  readonly rootQueryParams: readonly string[];
}

// Constraint delimiter grammar derives from the single `CONSTRAINT_BODY_PATTERN`
// atom (#804) so the strip side cannot desync from match/build.

export const CONSTRAINT_PATTERN_RGX = new RegExp(
  `<${CONSTRAINT_BODY_PATTERN}>`,
  "g",
);
