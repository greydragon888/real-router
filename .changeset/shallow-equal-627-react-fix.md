---
"@real-router/react": patch
---

Fix `shallowEqual` asymmetry on disjoint-key records (#627)

`shallowEqual({ a: undefined }, { b: "" })` returned `true` while
`shallowEqual({ b: "" }, { a: undefined })` returned `false`. The inner loop
read missing keys via bracket access as `undefined` and falsely matched
`prev[key] === undefined`. Added a `hasOwnProperty` guard mirroring React's
own `shallowEqual` (`packages/shared/shallowEqual.js`).

Discovered by a new property-based symmetry test in
`tests/property/shallowEqual.properties.ts` after fast-check shrunk the
counterexample to `[{"a":undefined},{"b":""}]` over 200 runs.

User-visible effect: `<Link routeParams={{ a: undefined }} />` no longer
compares equal to `<Link routeParams={{ b: undefined }} />` — re-render now
matches the documented `shallowEqual` contract (key-order-insensitive,
`Object.is` per key).
