---
"@real-router/core": minor
---

Every object export of the constants module is frozen (#1959)

`errorCodes` carried `Object.freeze` and a docblock saying *"Frozen to prevent
accidental modifications"*. The four records beside it — `constants`, `events`,
`plugins`, `DEFAULT_LIMITS` — carried neither, and nothing in the file said why
the split existed. Half the module was mutable module state that core reads at
**runtime**: `constants.UNKNOWN_ROUTE` at 8 sites, `events.*` at 11.

Measured, before:

```js
constants.UNKNOWN_ROUTE = "@@HIJACKED";
await router.navigateToNotFound("/nope");
router.getState().name;                    // "@@HIJACKED"
UNKNOWN_ROUTE;                             // "@@router/UNKNOWN_ROUTE"
```

The separately exported `UNKNOWN_ROUTE` string is unchanged, so **every consumer
comparing `state.name === UNKNOWN_ROUTE` silently stops matching**, and the
hijacked name stays in committed state after the constant is restored. Writing a
member of `events` makes every listener registered *before* the write go deaf —
`addEventListener`, a plugin's `onTransitionSuccess` and `router.subscribe` all
measured 0 hits against a baseline of 1 — process-wide, across routers.

⚠ **Two public types tighten with the freeze.** `Constants` was
`Record<ConstantsKeys, string>`, so the write above **type-checked**; it is
`Readonly<…>` now. `EventToNameMap` and `ErrorCodeToValueMap` gain `readonly`
members, matching `EventToPluginMap`, which already had them. A consumer
assigning to any of these now fails to compile as well as at runtime.

The set is pinned by derivation, not by a list: `constants-freeze-authority-1959`
reads `export const` off the source, so a ninth record has to answer the question
rather than inherit the gap.
