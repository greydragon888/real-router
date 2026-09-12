---
"@real-router/validation-plugin": patch
---

The shape mirrors refuse what a lying `Proxy` used to walk past (#2282)

Two predicates here decide object shape by reading the prototype, which a
`Proxy` traps: the `isPlainBag` mirror of core's dependency guard, and
`validateNavigateParamsShape`. An array behind a single `getPrototypeOf` lie was
accepted by both, where the same array bare is refused.

Both now ask `Array.isArray` alongside the prototype, matching core.

What each one buys was measured rather than assumed, because core refuses the
value one layer down and a bare "it throws" assertion stays green without either
term:

- the dependency mirror keeps the refusal arriving from THIS door, named
  (`[router.setDependencies] …`) instead of core's bare message — and keeps the
  mirror a mirror, which its own docblock requires;
- the params-shape guard owns `isActiveRoute`, where the copy that laundered the
  value does not run: without the term that predicate silently ANSWERED `false`
  for the lie while throwing for the bare array.
