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
 * inherits the brand without a cast). Casts to the brand occur only inside
 * `canonicalize`, at TWO sites — one per path, fast and slow. One FUNCTION, two
 * casts: the distinction is load-bearing here, because this paragraph's whole
 * subject is what the brand does and does not guarantee, and the guarantee is
 * stated in cast sites. `canonical-brand-authority-1968` owns the count.
 *
 * Deliberately NOT generic over the channel shapes — and Phase 2 settled that,
 * rather than deferring it. `matchPath<P>` carries a narrowed `P` straight
 * through this module (`matchPath<P>` → `materialize<P>` → `State<P>`), and it
 * does so with type parameters on the FUNCTIONS, not on this interface: with
 * non-generic primitives they would be unreachable — `canonicalize` returns
 * `Canonical<Params, SearchParams>`, which is not assignable to a narrowed one —
 * and with generic primitives they are unnecessary (the generic
 * `materialize<P, S>` over a plain `Canonical` type-checks on its own). Both
 * were verified with tsc. The edit that made the functions generic has landed;
 * this interface stayed plain and nothing has asked for the parameters since.
 * Added now they would be exactly the dead weight nothing detects that this
 * module refuses elsewhere (knip reports neither).
 */
export interface Canonical {
  readonly name: string;
  readonly path: Params;
  readonly query: SearchParams;
  readonly [CANON]: true;
}
