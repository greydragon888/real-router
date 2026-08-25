---
"@real-router/core": patch
---

A route definition is read once per own key, before the first guard (#1899)

Registration read each definition many times — measured, `route.name` **seven**
times for one `add`: the reserved-prefix walker, the dotted-name walker,
`walkRouteNames` twice, `sanitizeRoute`, `registerAllRouteHandlers`, and the
`Object.entries` that collects custom fields. Every read is an independent
question, so a definition whose `name` is an accessor was VALIDATED under one
answer and REGISTERED under another:

```ts
let n = 0;
api.add([
  {
    get name() {
      return ++n <= 4 ? "safe" : "@@router/UNKNOWN_ROUTE";
    },
    path: "/x",
  },
]);
// before: accepted — has("safe") false, has("@@router/UNKNOWN_ROUTE") TRUE
// after:  accepted — has("safe") true,  has("@@router/UNKNOWN_ROUTE") false
```

That walked past **both** always-on route-name rules, whose literal spelling is
refused: the reserved `@@` prefix (#1047) and the dotted name (#1763). The `@@`
row is the serious one — `assertNoInternalRouteName`'s own docblock gives the
reason it is always-on: _"Mutating such a name would let a real URL `matchPath`
to a state with `name === UNKNOWN_ROUTE`, silently conflating a genuine route
with 'not found'."_ That is the state it reached, past the guard, with no error.

All three population entry points now snapshot the batch before the first
guard — `createRouter([...])`, `add` and `replace` — so every existing guard
becomes correct by construction, which is the one thing hardening each reader
separately cannot do. Reads drop from **7 to 1** for `name` and from **3 to 1**
for `defaultSearch` (the `add` half of #1789); the read-count authority table
records both.

**Nothing is dropped that core was contracted to read.** The snapshot is a
spread, and own enumerable keys are exactly the supported input surface
(`packages/core/CLAUDE.md`, "Supported Input Shapes" — owner decision
2026-08-18). A spread also DEFINES rather than assigns, so a custom field
literally named `"__proto__"` survives as data — verified through
`getPluginApi(router).getRouteConfig(name)`, the surface that carries custom
fields.

A **throwing** getter is unaffected: the error propagates out of `add` and the
tree is untouched, exactly as before.

Part of #1901.
