---
"@real-router/search-schema-plugin": minor
---

Refuse a second registration on a router that already carries the plugin (#2974)

`router.usePlugin(searchSchemaPlugin(options))` on a router that already
carries the plugin, under any options, throws an `Error` with no `code` before
it registers anything:

```text
[search-schema-plugin] is already registered on this router — a clone already carries the plugins of its base router
```

A clone counts: `cloneRouter`, and `createRequestScope` through it, re-run the
base router's plugin factories, so a request router already carries the plugin.
The first instance keeps working, and after its `unsubscribe()` the router takes
the plugin again.

**Breaking Change:** the repeat was accepted, so every schema ran twice and each
rejection was reported twice; `@real-router/validation-plugin` refused only a
repeat of the same factory object. Remove the second registration — on a request
clone, the base router's registration already covers it.
