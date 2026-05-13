/**
 * Stable empty object for default params.
 *
 * `Object.freeze` makes mutation throw under ESM strict mode — this guards
 * against accidental writes that would corrupt the shared default across
 * every Link without explicit params.
 *
 * §8.1 audit note (LOW #19): consumers cast `EMPTY_PARAMS as P` at usage
 * sites (e.g. `Link.tsx`, `directives/link.tsx`). The cast is required for
 * type compatibility with the generic `P extends Params` and DOES technically
 * widen the `Readonly<{}>` type, but the underlying object stays frozen at
 * runtime — any attempt to mutate fails at the JS engine level regardless
 * of TS-level visibility. The frozen sentinel is also used by Link's
 * fast-path identity check (`props.routeParams === undefined` after the
 * §8.1 audit fix); changing this object's identity would silently break
 * that path.
 */
export const EMPTY_PARAMS = Object.freeze({});

/**
 * Stable empty options object.
 *
 * Same freeze/cast guarantees as `EMPTY_PARAMS` — the sentinel is shared
 * across all default `routeOptions` consumers (`Link`, `use:link`) to
 * avoid per-render `{}` allocations.
 */
export const EMPTY_OPTIONS = Object.freeze({});
