---
"@real-router/core": patch
---

fix(core): actionable error for a path-less navigateToNotFound() during the STARTING window (#1172)

`router.navigateToNotFound()` with no explicit path derived the default path from the committed state via a non-null assertion (`state.get()!.path`), justified by "isActive() guarantees state exists". That assumption is false during the router's two-phase start: while a start navigation is pending (async guard / start interceptor), `isActive()` is `true` but `getState()` is still `undefined`, so a path-less call crashed with a cryptic, code-less `TypeError: Cannot read properties of undefined (reading 'path')`.

It now throws `RouterError(ROUTER_NOT_STARTED)` with an actionable message ("cannot derive the path before the start navigation commits — pass an explicit path") — the same always-on invariant-guard class as the `start(path)` type guard (#939). The misleading non-null assertion is removed; a provided path is used directly.
