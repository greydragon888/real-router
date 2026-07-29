---
"@real-router/browser-plugin": patch
---

Keep the query channel and the fragment on popstate rollback (#1586)

`rollbackUrlToCurrentState` rebuilt the visible URL from `name` + `params`
alone, so a guard rejection or an unmatched back-navigation away from
`/list?tab=a&sort=z#anchor` restored `/list`.

The fragment went missing for the same reason as the query: the shared
`PopstateHandlerDeps.buildUrl` type still described the pre-#1548 three-argument
form `(name, params, options)` while the injected `createPluginBuildUrl` had
already shifted to `(name, params, search, options)`. The `{ hash }` object
therefore landed in the **search** slot — structurally a valid `SearchParams`,
so nothing complained — and `options` arrived `undefined`, which silently
defeated the hash preservation the call site's own #532 comment promises.

The deps signature now carries the query slot, and a type-equality pin between
it and `createPluginBuildUrl`'s return type fails the build if the two drift
apart again.
