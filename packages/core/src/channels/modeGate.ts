// packages/core/src/channels/modeGate.ts

import { EMPTY_SEARCH } from "../constants";

import type { SearchParams } from "../types";

/**
 * The mode gate (#1575): the query channel restricted to what the active
 * `queryParamsMode` will actually PRINT.
 *
 * Under `loose` the build prints undeclared keys too, so the whole bag is
 * admitted and the caller skips this entirely (`admitsUndeclaredQuery()`).
 * Under `default` / `strict` the build prints declared names only — so a key
 * that survives into `state.search` here can never appear in `state.path`, and
 * the two channels of one state disagree. Filtering at the merge, on BOTH
 * directions, is what buys the invariant `keys(state.search) ⊆
 * keys(matchPath(state.path).search)` in every mode.
 *
 * A DROP, not a move: the key does not migrate to `state.params` (that would
 * re-create the channel ambiguity #1553 is about) — it simply is not state.
 * `validation-plugin` reports the drop; bare core is silent by the same
 * always-on-fixes / opt-in-diagnoses split as the channel guard.
 *
 * Returns the input bag unchanged when nothing is dropped, so the common case
 * (a route whose query keys are all declared) allocates nothing.
 *
 * @internal
 */
export function admittedSearch<S extends SearchParams>(
  search: S,
  queryNames: readonly string[],
  onDropped?: (key: string) => void,
): S {
  let admitted: Record<string, unknown> | undefined;
  let dropped = false;

  // `Object.entries` (own enumerable only) rather than `for…in` + `Object.hasOwn`
  // — the same idiom the deleted `separateChannels` used, and it keeps the guard branch
  // out of the file instead of leaving one no test can reach.
  for (const [key, value] of Object.entries(search)) {
    if (queryNames.includes(key)) {
      admitted ??= {};
      admitted[key] = value;
    } else {
      dropped = true;
      // The drop is silent in bare core; `validation-plugin` passes a reporter.
      // Reported from HERE rather than re-derived by the caller so the message
      // can never disagree with what was actually dropped, and so the scan
      // happens once. The callback is only ever supplied when a validator is
      // installed, so the default path stays a plain filter.
      onDropped?.(key);
    }
  }

  if (!dropped) {
    return search;
  }

  // Frozen, because this is the ONLY branch that hands back a bag the caller did
  // not already freeze: `search` arrives frozen from `mergeWithDefault`, and the
  // no-drop branch returns it untouched. Before nav-pipeline Phase 2 the gap was
  // invisible — every consumer re-merged (and re-froze) downstream in the
  // then-separate `makeState`. `materialize` deliberately does not, so an
  // unfrozen `admitted` reached `state.search` verbatim and broke "states are
  // deeply frozen" for exactly the states the gate had touched. Phase 4 folded
  // `makeState` into `materialize`, so there is no re-merge left anywhere: this
  // freeze is now the only one on the drop path.
  return Object.freeze(admitted ?? EMPTY_SEARCH) as S;
}
