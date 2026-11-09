---
"@real-router/sources": minor
---

`canonicalJson` keys a `Date`, a nested object and a non-JSON value as `@real-router/core` compares them (#2905)

`createActiveRouteSource` keys its cache by `canonicalJson(params)` and `canonicalJson(search)`. Two links whose values core tells apart could share one key — a `Date` and its ISO string, `NaN` and `null` — and the second link then showed the first one's active state.

- A `Date` that is a bag value, or an element of an array value, is spelled by its time, apart from every string. Inside a plain object it stays its ISO string, as `JSON.stringify` spells it for core.
- A plain object below the bag keeps its own key order: core compares it by `JSON.stringify`. The bag's own keys are still sorted.

**Breaking Change:** `canonicalJson` throws a `TypeError` where it returned a string, on:

- a function, a symbol, `NaN` or `±Infinity`, at any depth;
- `undefined` or a hole in an array that is a bag value or an element of such an array;
- an object that is not a plain object, an array or a `Date` — a class instance, a `Temporal` value, a `URL`, an object from another realm.

`Map`, `Set`, `WeakMap`, `WeakSet`, `RegExp`, `BigInt` and cycles throw as before. `createActiveRouteSource`, and `createActiveSource` through it, catch the throw and return a fresh non-cached source whose `destroy()` works, as for `BigInt` params.

**Migration:** a direct caller of `canonicalJson` catches the `TypeError` for such values. One that parses the returned text finds `{"\u0000Date":<time>}` for a `Date` value, and a nested object's keys in their own order.
