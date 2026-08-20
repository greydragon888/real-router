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
 * ⚑ No `__proto__` handling here, and the reason is OWNERSHIP, not reachability
 * (#1792). `admitted[key] = value` below would swap this accumulator's prototype
 * for that one name — but every bag this gate is handed is one core BUILT: its
 * sole caller (`pipeline/canonicalize`) passes the output of `mergeWithDefault`,
 * which copies into a fresh object and names the key while doing so. The rule is
 * "guard every copy of a FOREIGN bag"; this one copies core's own.
 *
 * ⚠ That distinction is load-bearing. An earlier revision justified the same
 * omission by reachability — "no input can get here" — and was wrong, because
 * the upstream copy it trusted had a hole, and through that hole this line was
 * reached. A claim about who OWNS the object survives a hole upstream; a claim
 * about what can reach the line does not. If a second caller ever hands this
 * function foreign data, the guard belongs back.
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
  // `makeState` onto `canonicalize` + `materialize`, so there is no re-merge
  // left anywhere: this freeze is now the only one on the drop path.
  return Object.freeze(admitted ?? EMPTY_SEARCH) as S;
}
