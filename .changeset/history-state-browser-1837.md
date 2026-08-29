---
"@real-router/browser-plugin": patch
---

fix: `history.state` restores four channels and now validates four (#1837)

`history.state` is the one input this plugin takes that a third party genuinely
controls — a previous page, another script, or an entry written by an older
version of your app. Four fixes to how a restored entry is screened and written
back. They live in `shared/browser-env`, so `@real-router/hash-plugin` gets the
same four.

**1. The query channel is screened by value, like the path channel.** A restored
`search` reached the frozen `state.search` with any value at all, while the
IDENTICAL value in `params` was refused:

```js
// all six were ACCEPTED into state.search before; all six are refused now
{ tab: () => 1 }   { tab: Symbol() }   { tab: 10n }
{ tab: <cyclic> }  { tab: new Date() } { tab: new Map() }
```

Measured end to end: `state.search.tab` of type `function`, `buildPath` printing
`?tab=()%20%3D%3E%201`, and a real `history.pushState` throwing
`DataCloneError` on the next write.

⚠ The query domain is unchanged — a repeated key still parses to an array and a
bare `?flag` to `null`, and both still restore.

⚠ **What finding 1 also takes.** A `search` whose object carries a custom
prototype — a class instance, or `Object.create(someBag)` — was accepted before
(as an empty bag, since only own keys are read) and is refused now, because
`isParams` rejects a non-`Object.prototype` prototype exactly as it always has
for `params`. The two channels agree, which is the point; and the shape cannot
survive a real `history.pushState` round trip anyway, since structured
deserialization yields plain objects. Reachable only from a synthetic
`PopStateEvent`.

**2. The guard's own reads no longer rethrow.** A `history.state` carrying an
accessor, or a `get`-trapping Proxy, made `isState` throw out of a type guard.
The popstate handler then took its non-`RouterError` path
(`recoverFromCriticalError`) instead of falling back to `matchPath` — a wrong
classification rather than a crash. An unreadable payload is now simply not
restorable, the same answer any other malformed entry gets.

**3. A persisted `UNKNOWN_ROUTE` answers to `allowNotFound`.** With
`allowNotFound: false`, Back to an entry written while the option was `true`
still committed the 404 the option forbids. Measured: the plugin itself writes
`{"name":"@@router/UNKNOWN_ROUTE","params":{},"search":{},"path":"/nope"}` under
`allowNotFound: true`, so the entry is ordinary, not adversarial. It now takes
the same branch a live unmatched URL takes: `true` restores, `false` emits
`ROUTE_NOT_FOUND` and rolls the URL back.

**4. The URL rollback writes the four-channel projection.** It wrote the whole
committed `State`, so `context` and `transition` went into `history.state` on
a guard-rejected Back, a SAME_STATES popstate and a strict-mode unmatched URL —
the first two through the handler's `RouterError` catch, the third through its
own branch. ⚠ `context` is a public plugin slot this plugin does not control,
and a real `replaceState` serialises: a plugin publishing a non-cloneable value
made the rollback throw into an empty `catch`, so the URL was never rolled back
at all.

⚠ **If you read `history.state` yourself:** rollback entries now carry exactly
`{ name, params, search, path }`, matching every other write site. Measured,
ordinary entries always did — the two extra members appeared only on rollback
ones.
