---
"@real-router/core": minor
---

Harden `claimContextNamespace` against a `"__proto__"` namespace (#1191)

`claim("__proto__").write(state, value)` previously ran `state.context["__proto__"] = value`, which dispatches into the inherited `Object.prototype.__proto__` setter and swaps the prototype of `state.context` instead of creating an own entry — the plugin's data then silently vanished from `Object.keys` and the SSR transport (`serializeRouterState` emitted `context: {}`). The write now uses `Object.defineProperty` for the `"__proto__"` key (mirroring `@real-router/search-params`), so it becomes a genuine own property; normal names keep the plain-assignment fast path with zero behavior change.

`serializeRouterState`'s `excludeContext` path — exposed by the above fix — now builds its filtered context on a `null`-prototype object so a preserved `"__proto__"` namespace survives the filter too.

`claimContextNamespace` also now rejects a non-string or empty namespace with a `TypeError`, symmetric with the other always-on invariant guards (`subscribe` / `start` / `navigateToNotFound`). This is a contract tightening — a previously-accepted `claim("")` / `claim(42)` now throws.
