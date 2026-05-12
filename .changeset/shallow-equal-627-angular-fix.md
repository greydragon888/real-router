---
"@real-router/angular": patch
---

Fix `shallowEqual` asymmetry on disjoint-key records (#627)

`shallowEqual({ a: undefined }, { b: "" })` returned `true` while
`shallowEqual({ b: "" }, { a: undefined })` returned `false`. The inner loop
read missing keys via bracket access as `undefined` and falsely matched
`prev[key] === undefined`. Added a `hasOwnProperty` guard mirroring React's
own `shallowEqual` (`packages/shared/shallowEqual.js`).

Angular consumes a git-tracked copy of `dom-utils` (ng-packagr does not
follow symlinks); the fix was applied to both `shared/dom-utils/link-utils.ts`
and `packages/angular/src/dom-utils/link-utils.ts` and verified identical.

User-visible effect: `<a realLink [routeParams]="{ a: undefined }">` no
longer compares equal to `[routeParams]="{ b: undefined }"` in directive
memoization paths — re-render now matches the documented `shallowEqual`
contract (key-order-insensitive, `Object.is` per key).
