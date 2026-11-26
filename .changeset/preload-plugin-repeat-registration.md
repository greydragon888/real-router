---
"@real-router/preload-plugin": minor
---

Refuse a second registration on a router that already carries the plugin (#2974)

`router.usePlugin(preloadPluginFactory(options))` on a router that already
carries the plugin, under any options and with `document` or without it, throws
an `Error` with no `code` before it registers anything:

```text
[@real-router/preload-plugin] is already registered on this router — a clone already carries the plugins of its base router
```

A clone counts: `cloneRouter`, and `createRequestScope` through it, re-run the
base router's plugin factories, so a request router already carries the plugin.
The first instance keeps working, and after its `unsubscribe()` the router takes
the plugin again. Without `document` the plugin is a `teardown` alone, which
takes the router out of the mark.

**Breaking Change:** on a server, where the plugin registers nothing, the repeat
was accepted; with `document`, core refused it with a `RouterError` with the
code `PLUGIN_CONFLICT`. Remove the second registration — on a request clone, the
base router's registration already covers it.
