---
"@real-router/ssr-data-plugin": patch
---

A `defer()` payload is refused when the plugin has no deferred channel (#1917)

The refusal lands in `shared/ssr/createSsrLoaderPlugin.ts`, which this package
shares. It is **unreachable through `ssrDataPluginFactory`** — that factory always
configures `ssrDataDeferred` / `ssrDataDeferredKeys`, so a `defer()` payload takes
the split branch as before. The behaviour that changes is
`@real-router/rsc-server-plugin`'s, and its changeset describes it.

⚑ Named here because this package is the coverage owner of `shared/ssr` (#809),
so the cell that pins the refusal lives in its
`tests/functional/shared-loader-plugin.test.ts` — the file that exists to exercise
the wiring `ssrDataPluginFactory` never produces.
