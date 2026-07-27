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
 *
 * Deliberately NOT generic over the channel shapes. `matchPath<P>` does carry a
 * narrowed `P` today (through `makeState<P>`) and will want it back when it
 * migrates here, but type parameters on THIS interface do not provide that:
 * with non-generic primitives they are unreachable — `canonicalize` returns
 * `Canonical<Params, SearchParams>`, which is not assignable to a narrowed one —
 * and with generic primitives they are unnecessary (a generic `materialize<P, S>`
 * over a plain `Canonical` type-checks on its own). Both were verified with tsc.
 * So the parameters belong to the same edit that makes the FUNCTIONS generic,
 * whenever a caller needs it; added now they would be exactly the dead weight
 * nothing detects that this module refuses elsewhere (knip reports neither).
 */
export interface Canonical {
  readonly name: string;
  readonly path: Params;
  readonly query: SearchParams;
  readonly [CANON]: true;
}
