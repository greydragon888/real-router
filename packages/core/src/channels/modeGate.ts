// packages/core/src/channels/modeGate.ts

import { EMPTY_SEARCH } from "../constants";
import { putField } from "../utils/ingest";

import type { SearchParams } from "../types";

// ⚑ Captured at module load, for the reason `helpers.ts` states over its own
// three: a guarantee is only as strong as the intrinsic it reads WHEN IT RUNS,
// and an application can re-point `Object.freeze` after boot. Measured with the
// global neutered: this site handed back an UNFROZEN `state.search`, and the
// cell that pins the capture next door stayed green because its arc gets
// `search` from the channel merge, whose freeze was already captured (#1928
// walked the level above and found this one).
const freeze = Object.freeze;

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
 * ⚑ The write goes through `putField` (#1852), and the two arguments this
 * docblock used to make for omitting a guard are BOTH retired — worth recording,
 * because each was true when written and neither was the hazard.
 *
 * The first was reachability ("no foreign input can get here"), and it was
 * refuted directly: the upstream copy it trusted had a hole, and through that
 * hole this line was reached. The second was ownership ("every bag this gate is
 * handed is one core BUILT"), which survived that refutation and is still true —
 * `pipeline/canonicalize` passes the output of `mergeQueryChannel`, and every one
 * of its exits is core's own object. What ownership does NOT survive is the
 * ambient prototype: whose bag the SOURCE is says nothing about what
 * `Object.prototype` carries under the name being written, and the accumulator
 * here is a plain `{}` whatever the source was. Measured on a `?page` route with
 * an ambient accessor: `navigate` rejected with a `TypeError` from this line.
 *
 * ⚠ So the general lesson stands, one level deeper than it was stated. A claim
 * about who OWNS the source object survives a hole upstream where a claim about
 * REACH does not — but neither one licenses a plain store under a key the author
 * did not choose, because the destination's chain is the third party to the
 * argument and belongs to the application.
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
      // ⚑ The key is one the ROUTE declares with `?`, so it is exactly the kind
      // of ordinary name an application puts on `Object.prototype` (#1852).
      // Measured on a plain `?page` route with an ambient accessor: `navigate`
      // rejected with `TypeError: Cannot set property page …` from this line.
      putField(admitted, key, value);
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
  // not already freeze: `search` arrives frozen from `mergeQueryChannel`, and the
  // no-drop branch returns it untouched. Before nav-pipeline Phase 2 the gap was
  // invisible — every consumer re-merged (and re-froze) downstream in the
  // then-separate `makeState`. `materialize` deliberately does not, so an
  // unfrozen `admitted` reached `state.search` verbatim and broke "states are
  // deeply frozen" for exactly the states the gate had touched. Phase 4 folded
  // `makeState` onto `canonicalize` + `materialize`, so there is no re-merge
  // left anywhere: this freeze is now the only one on the drop path.
  return freeze(admitted ?? EMPTY_SEARCH) as S;
}
