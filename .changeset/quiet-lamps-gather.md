---
"@real-router/browser-plugin": minor
---

A plugin-built URL runs a `forwardState` interceptor ONCE

`buildUrl` resolves through `forwardState` and then prints. Until now it printed
through `router.buildPath`, which runs the same chain again one door lower
(#2087), so a single URL invoked every registered interceptor twice. It now
prints through `PluginApi.buildPathResolved`, the seam-free printer.

The URL is unchanged for an idempotent interceptor, which both first-party seam
plugins are. A stateful one — a counter, a cache warmer, a logger — sees one
invocation per URL where it previously saw two.
