---
"@real-router/validation-plugin": patch
---

Make `validationPlugin()` generic over the router's dependency map (#1621)

The factory returned `PluginFactory` with the `DefaultDependencies` (= `object`)
default. `keyof object` is `never`, so `getDependency` was typed
`(key: never) => never`, and TypeScript 7 — which performs a variance check
TypeScript 6 skipped — refuses to assign that where `PluginFactory<D>` is
expected for any `D` with an index signature. Consumers on `typescript@7` (now
`latest`) typing their dependencies as `Record<string, T>` could not register the
plugin at all: `router.usePlugin(validationPlugin())` failed with TS2345.

`validationPlugin<D>()` now carries the caller's map, inferred from the router in
the usual case. No runtime change, and no source change is required — the type
parameter defaults exactly as before.
