---
"@real-router/persistent-params-plugin": minor
---

Refuse a second registration on a router that already carries the plugin (#2974)

`router.usePlugin(persistentParamsPluginFactory(config))` on a router that
already carries the plugin, under any config and the empty one included, throws
an `Error` with no `code` before it claims anything:

```text
[@real-router/persistent-params-plugin] is already registered on this router — a clone already carries the plugins of its base router
```

A clone counts: `cloneRouter`, and `createRequestScope` through it, re-run the
base router's plugin factories, so a request router already carries the plugin.
The first instance keeps working, and after its `unsubscribe()` the router takes
the plugin again. A plugin that holds the `persistentParams` namespace still
meets core's `RouterError(CONTEXT_NAMESPACE_ALREADY_CLAIMED)`.

**Breaking Change:** with an empty config (`[]` or `{}`) the repeat was accepted;
with params, core refused it with `RouterError(CONTEXT_NAMESPACE_ALREADY_CLAIMED)`
when the second instance claimed `persistentParams`, and a handler that matched
that code for the repeat no longer sees one. Remove the second registration, or
`unsubscribe()` the first one before registering again.
