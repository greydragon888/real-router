---
"@real-router/core": patch
---

A `"__proto__"` custom field no longer swaps the route-config bag's prototype (#1788)

`prepareCustomFields` merged an `update()` patch into the stored custom-field record
with a plain assignment, `next[key] = value`. For the one literal key `"__proto__"`
that dispatches into the inherited `Object.prototype.__proto__` **setter** instead
of creating an entry, so:

- an **object** value swapped the prototype of the record the router then stored —
  and that record is what `getPluginApi(router).getRouteConfig(name)` hands to
  plugins, which read it BY KEY. Measured on a patch that came from JSON, on a
  route already carrying one plugin field:

  ```
  update("a", JSON.parse('{"__proto__":{"preload":"INJECTED"}}'))
    own keys ["meta"]      ← the injection is invisible here
    .preload "INJECTED"    ← inherited through the swapped prototype
  ```

  `preload-plugin` reads `config?.preload` and `lifecycle-plugin` reads
  `config?.[hookName]`, then COMPILES what it finds as a factory, so an injected
  function reached both. `Object.prototype` itself was never touched — the swap was
  scoped to one route's record and cleared by the next custom-field update;
- a **non-object** value was silently dropped, because that setter ignores it. So a
  plugin field named `__proto__` was registrable but not patchable.

Fixed with `Object.defineProperty`, special-cased for that one key, mirroring the
two existing write primitives — `assignParam`
(`engine/search-params/searchParams.ts`, #855) and `claim.write`
(`api/getPluginApi.ts`, #1191), whose comment says why. `__proto__` is the only
ACCESSOR on `Object.prototype`; `constructor` / `toString` / `valueOf` are plain data
properties and always landed correctly, so normal names keep the plain-assignment
fast path — measured at **31.7 ns** per three-key patch against **294.0 ns** for an
unconditional `defineProperty`, a 9.3× difference on the common branch.

**It also makes the doors agree.** Registration builds the record with
`Object.fromEntries`, which DEFINES properties, so `createRouter` / `add` /
`replace` always stored the field faithfully — `update` was the one door that did
not. All four now produce an identical ordinary data property
(`writable`/`enumerable`/`configurable: true`), which the new test asserts as a
descriptor rather than as a value.

⚠ Three observable improvements, all new: `getRouteConfig(name)` now returns a
`__proto__` field where the whole record used to be dropped (the swapped record had
zero own keys, so the caller deleted it); a scalar value under that key is kept
instead of vanishing; and a consumer that SERIALIZES the bag now sees the field —
measured, `JSON.stringify(getRouteConfig("a"))` goes from `{"meta":1}` to
`{"meta":1,"__proto__":{…}}`, because the data is in the record rather than on its
prototype. Anything reading by key is unaffected either way.

⚠ **The same write primitive is LIVE one subsystem over, filed as #1792 and not
fixed here.** `normalizeParams` / `mergeDefined` (`src/helpers.ts`) assign the
caller's keys the same way, so a `navigate("a", JSON.parse('{"__proto__":…}'))`
commits a state whose `params` prototype is swapped. It is deliberately separate:
those two sit on the hot navigate path and produce the frozen, published, serialized
`state.params`, so the fix has a perf dimension and an API-shape question this
cold-path change does not.

ℹ The route-name-keyed containers were never affected and needed no change: every
`RouteConfig` map and `routeCustomFields` itself is an `Object.create(null)`
dictionary, so a route literally named `__proto__` already writes a real own entry
there — verified on all six of them, plus `remove()`.
