---
"@real-router/core": patch
---

`isActiveRoute` answers `false` for a name that is not a string (#1881)

**Who is affected:** callers passing `isActiveRoute` something other than a
string. It is declared `string`, so this needs a cast in TypeScript, and is
reachable from JavaScript or from a name computed at runtime.

The predicate used the value as a **property key** at up to nine sites — the
same forward maps `defaultRoute` reached — and through the `forwardTo` arm the
answer became indistinguishable from the string call. A `<Link>` could report
itself active on a value that never named a route, and a value that answered
differently between reads could be admitted as one route and compared as
another.

It now returns `false` without reading the value at all.

No measurable cost. The evidence is the repo's CodSpeed suite, which measures
this predicate on every PR: between this change and its base, **0 of 90
benchmarks moved**, aggregate impact −0.0006 %, with `state/isActiveRoute-exact`,
`-sibling` and `-navbar-5` all among the unchanged. The gate also _removes_ up
to nine coercions from the shape it refuses.

⚠ Two things an earlier draft of this note said are withdrawn. It quoted a
local wall-clock figure ("49.87 ns vs 49.84 ns"); that harness cannot resolve a
difference this small — its A/A null is as large as the signal — and its
absolute number did not reproduce. And it said the predicate "runs per `<Link>`
per render": it does not. A default `<Link>` takes a name-only fast path in
`@real-router/sources` and never reaches this door; the slow path
(`routeParams` / `routeSearch` / `activeStrict` / `ignoreQueryParams={false}` /
`hash`) and `navigateWithHash` do.

`@real-router/validation-plugin` continues to report the same input as an error
at the call, rather than silently answering `false`.

⚠ One diagnostic goes quiet. A non-string name used to fall through to a
`try`/`catch` that logged `…treating the link as inactive` on every call; the
type check now short-circuits ahead of it, so a mistyped `<Link>` that used to
be noisy in the console is silent. The answer is unchanged — `false` either
way — and `@real-router/validation-plugin` still throws its own `TypeError` at
the call, which is where a diagnosis belongs.
