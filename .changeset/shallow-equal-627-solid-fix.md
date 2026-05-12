---
"@real-router/solid": patch
---

Fix `shallowEqual` asymmetry on disjoint-key records (#627)

`shallowEqual({ a: undefined }, { b: "" })` returned `true` while
`shallowEqual({ b: "" }, { a: undefined })` returned `false`. The inner loop
read missing keys via bracket access as `undefined` and falsely matched
`prev[key] === undefined`. Added a `hasOwnProperty` guard mirroring React's
own `shallowEqual` (`packages/shared/shallowEqual.js`).

The helper is inlined from `shared/dom-utils/link-utils.ts` via the symlink
graph, so this adapter receives the fix in lockstep with the other 5
adapters.

User-visible effect: `<Link routeParams={{ a: undefined }} />` no longer
compares equal to `<Link routeParams={{ b: undefined }} />` — re-render now
matches the documented `shallowEqual` contract (key-order-insensitive,
`Object.is` per key).
