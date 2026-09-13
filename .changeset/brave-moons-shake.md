---
"@real-router/svelte": minor
---

A `<Link>` href runs a plugin's `forwardState` interceptor ONCE

The href door resolves through `forwardState` and then prints. Until now it
printed through `router.buildPath`, which runs the same chain again one door
lower (#2087), so a single href invoked every registered interceptor twice. It
now prints through `PluginApi.buildPathResolved`, the seam-free printer.

The rendered href is unchanged for an idempotent interceptor, which both
first-party seam plugins are. A stateful one — a counter, a cache warmer, a
logger — sees one invocation per href where it previously saw two.
