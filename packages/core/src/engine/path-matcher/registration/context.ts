// Shared registration context: the `RegistrationState` interface and the frozen
// empty-value sentinels (#1009). Leaf module (no sibling imports) so
// `trie`/`trieNodes`/`buildParts` can depend on `RegistrationState` without
// cycling back to the orchestrator.

import type {
  BuildParamSlot,
  CompiledRoute,
  ResolvedMatcherOptions,
  SegmentNode,
} from "../types";

// Shared frozen sentinels for the no-params common case — avoid a fresh empty
// Set/array per route (#1009). All are ReadonlySet/[] and read-only on the
// match/build hot paths.
export const EMPTY_STRINGS: readonly string[] = Object.freeze([]);

// #1240 §5: freeze the Set shell too, so the "Shared frozen sentinels" claim
// above holds for ALL of them and the #1009 sentinels are consistent with route-tree's
// frozen `EMPTY_CHILDREN_MAP`. `Object.freeze` locks only the shell (not `.add`
// — see route-tree INVARIANTS CC1), but these are `Readonly`-typed and never mutated.
export const EMPTY_STRING_SET: ReadonlySet<string> = Object.freeze(
  new Set<string>(),
);

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
