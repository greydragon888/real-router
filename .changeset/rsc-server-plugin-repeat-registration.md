---
"@real-router/rsc-server-plugin": minor
---

Refuse a second registration of either plugin on a router that already carries it (#2974)

`rscServerPluginFactory(loaders)` and `rscActionPluginFactory(getResult)` each
refuse a registration on a router that already carries that plugin with an
`Error` with no `code`, thrown before the plugin claims anything:

```text
[@real-router/rsc-server-plugin] is already registered on this router — a clone already carries the plugins of its base router
```

A clone counts: `cloneRouter`, and `createRequestScope` through it, re-run the
base router's plugin factories, so a request router already carries the base's
plugins. Each factory keeps a mark of its own, so one router still takes both
plugins, and `@real-router/ssr-data-plugin` beside them. The first instance
keeps working, and after its `unsubscribe()` the router takes the plugin again.
A plugin that holds the `rsc` or `rscAction` namespace still meets core's
`RouterError(CONTEXT_NAMESPACE_ALREADY_CLAIMED)`.

**Breaking Change:** the repeat threw core's
`RouterError(CONTEXT_NAMESPACE_ALREADY_CLAIMED)`, as the README said. Remove the
second registration; a handler that matched that code for the repeat no longer
sees one.
