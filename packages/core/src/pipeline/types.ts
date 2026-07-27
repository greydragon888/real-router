// packages/core/src/pipeline/types.ts

import type { Params, SearchParams } from "../types";

/**
 * Brand carrier for {@link Canonical}. Deliberately NOT exported (not even from
 * this module's barrel): a `unique symbol` that never leaves the module cannot
 * be named outside it, so `materialize({ name, path, query })` fails to compile
 * with "Property '[CANON]' is missing". That is the whole guarantee — every URL
 * and every State is built from a bag that went through `canonicalize`, and
 * "build a State out of un-defaulted channels" becomes unrepresentable rather
 * than a bug someone must remember not to write.
 *
 * Compile-time only: phantom field, zero runtime cost.
 */
declare const CANON: unique symbol;

/**
 * The canonical navigation intent: a resolved route name plus its two channels,
 * defaults already merged. The ONLY producer is `canonicalize`; `buildURL` and
 * `materialize` physically accept nothing else.
 *
 * `path` is the path channel (becomes `state.params`), `query` the query
 * channel (becomes `state.search`) — named after the channels, not after the
 * State fields, because the same value feeds both the URL and the State.
 *
 * Honest boundary: the brand stops *accidental* fabrication, not a deliberate
 * `as` cast, and not spread-drift INSIDE this module (`{ ...c, path: … }`
 * inherits the brand without a cast). The single cast site is `canonicalize`.
 */
export interface Canonical<
  P extends Params = Params,
  S extends SearchParams = SearchParams,
> {
  readonly name: string;
  readonly path: P;
  readonly query: S;
  readonly [CANON]: true;
}
