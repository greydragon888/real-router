---
"@real-router/hash-plugin": patch
---

Read `forceDeactivate` and `base` defaults from the shared `browser-env` object (#1651)

`defaultOptions` now spreads `sharedUrlPluginDefaults` from `shared/browser-env/defaults.ts`, the single value read by `browser-plugin`, `hash-plugin` and `navigation-plugin`; `hashPrefix` stays local as URL mechanics only this plugin owns. Values are unchanged (`forceDeactivate: false`, `base: ""`, `hashPrefix: ""`) — the point is that "does browser Back honour `canDeactivate`" stops being three independently editable copies, the arrangement whose drift reached users in #524/#1645.

The stale `@default true` on `HashPluginOptions.forceDeactivate` is corrected to `false`, matching what the plugin has shipped since #1645.
