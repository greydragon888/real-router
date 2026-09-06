---
"@real-router/ssr-utils": patch
---

Stop `createRequestScope` from installing `dispose` under the string `"undefined"` on Node 22 (#2117)

The returned scope was built with `[Symbol.asyncDispose]: dispose` as a computed key in an object literal. `Symbol.asyncDispose` reaches Node in 24.0.0, so on Node 22 LTS that key evaluated to `undefined` and was coerced to the **string** `"undefined"` — a junk member on a handle callers enumerate, log and snapshot:

```js
Object.getOwnPropertyNames(createRequestScope(req, base));
// Node 22, before: ["router", "signal", "dispose", "undefined"]
// Node 22, now:    ["router", "signal", "dispose"]
```

The key is now resolved the way a transpiler's `await using` helper resolves it — the well-known symbol where the host has one, `Symbol.for("Symbol.asyncDispose")` where it does not — so it is a symbol on every host and no host value can become a property name. The read happens per call rather than once per module, so a polyfill loaded after this module still reaches the scopes built afterwards.

**`await using` now works on Node 22** under an esbuild-lowered build (Vite and vitest transpile that way), because the registry key is exactly the one esbuild's helper looks for. It still fails under `tsc` at a downlevel target: that helper throws `TypeError: Symbol.asyncDispose is not defined.` before it looks at the object, so nothing on the scope can rescue it. The documented `try/finally` + `await scope.dispose()` form is unchanged and works everywhere.

Nothing changes on a runtime that ships the symbol: the member is present exactly as before, pinned by an assertion on its full property descriptor.
