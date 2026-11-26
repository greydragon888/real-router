---
"@real-router/browser-plugin": patch
---

Refuse a repeat registration with the plugin's own error (#2974)

A registration on a router that already carries the plugin throws an `Error`
with no `code` before the plugin claims anything:

```text
[browser-plugin] is already registered on this router — a clone already carries the plugins of its base router
```

A clone counts: `cloneRouter`, and `createRequestScope` through it, re-run the
base router's plugin factories. Core refused the repeat with
`RouterError(CONTEXT_NAMESPACE_ALREADY_CLAIMED)`, whose message named another
plugin. A plugin that holds the `browser` namespace still meets that refusal.
