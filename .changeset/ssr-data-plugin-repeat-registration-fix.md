---
"@real-router/ssr-data-plugin": patch
---

Refuse a repeat registration with the plugin's own error (#2974)

A registration on a router that already carries the plugin throws an `Error`
with no `code` before the plugin claims anything:

```text
[@real-router/ssr-data-plugin] is already registered on this router — a clone already carries the plugins of its base router
```

A clone counts: `cloneRouter`, and `createRequestScope` through it, re-run the
base router's plugin factories, so a request router already carries the plugin
its base registered. Core refused the repeat with
`RouterError(CONTEXT_NAMESPACE_ALREADY_CLAIMED)`, whose message named another
plugin. A plugin that holds the `data` namespace still meets that refusal, and
`@real-router/rsc-server-plugin` keeps a mark of its own, so one router takes
both.
