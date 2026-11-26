---
"@real-router/lifecycle-plugin": minor
---

Refuse a second registration on a router that already carries the plugin (#2974)

`router.usePlugin(lifecyclePluginFactory())` on a router that already carries
the plugin throws an `Error` with no `code` before it registers anything:

```text
[@real-router/lifecycle-plugin] is already registered on this router — a clone already carries the plugins of its base router
```

A clone counts: `cloneRouter`, and `createRequestScope` through it, re-run the
base router's plugin factories, so a request router already carries the plugin.
The first instance keeps working, and after its `unsubscribe()` the router takes
the plugin again.

**Breaking Change:** without `@real-router/validation-plugin` the repeat was
accepted and every route hook ran twice; with it, the repeat was refused with
`[router.usePlugin] Plugin factory already registered…`. Remove the second
registration — on a request clone, the base router's registration already
covers it.
