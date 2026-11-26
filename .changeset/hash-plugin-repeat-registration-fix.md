---
"@real-router/hash-plugin": patch
---

Refuse a repeat registration with the plugin's own error (#2974)

A registration on a router that already carries the plugin throws an `Error`
with no `code` before the plugin registers anything:

```text
[hash-plugin] is already registered on this router — a clone already carries the plugins of its base router
```

A clone counts: `cloneRouter`, and `createRequestScope` through it, re-run the
base router's plugin factories. Core refused the repeat with
`RouterError(PLUGIN_CONFLICT)` (`property "buildUrl" already exists`), and after
a refused repeat with another `browser`, `start()` without a path took its
location from that `browser`. A plugin that holds one of this plugin's router
properties still meets core's refusal.
