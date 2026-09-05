---
"@real-router/rx": minor
---

Install the TC39 interop member under a real key, never the string `"undefined"` (#1739)

`RxObservable` declared the interop method as `[Symbol.observable]()`. `Symbol.observable` is not a well-known symbol — a host has one only if something polyfilled it — so on a host without a polyfill the computed key evaluated to `undefined` and the method was installed under the **string** `"undefined"` — visible in `Object.getOwnPropertyNames(Object.getPrototypeOf(observable(router)))` and in devtools. An ambient `declare global { interface SymbolConstructor { readonly observable: symbol } }` is what made that type-check.

The method is now declared once, under `"@@observable"`, and **the same function** is aliased onto the host's `Symbol.observable` when there is one — matching the descriptor a class method carries. On a bare host the prototype's own property names are exactly `constructor`, `subscribe`, `pipe`, `@@observable`.

`from(observable(router))` is unaffected on either host: a consumer takes the host's `Symbol.observable` when there is one and the `"@@observable"` string otherwise, and both spellings answer wherever they exist.

**Breaking**, all three from removing the phantom member rather than from new behaviour:

- `obs[Symbol.observable]()` no longer resolves on a host without a polyfill. It previously returned the observable only because `Symbol.observable` and the installed key were both `undefined`. Use `from(observable(router))`, or `obs["@@observable"]()`.
- `RxObservable`'s published type no longer declares `[Symbol.observable](): this`.
- The package no longer augments the global `SymbolConstructor`. Code that relied on `@real-router/rx` to type `Symbol.observable` needs its own declaration — or none, if `rxjs` is already in the program: `rxjs@7.8.2` ships the identical augmentation in `internal/types.ts`.

Unchanged: the alias is resolved when the module is evaluated, so a polyfill imported afterwards still does not reach the prototype — see the [rx wiki page](https://github.com/greydragon888/real-router/wiki/rx-package#observablerouter).
