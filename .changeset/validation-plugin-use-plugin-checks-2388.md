---
"@real-router/validation-plugin": minor
---

The `usePlugin` validation is registered as checks and diagnostics (#2388)

The limit, the duplicate-factory and the plugin-key refusals are checks at
`usePlugin:count`, `usePlugin:entry` and `usePlugin:plugin`, and the threshold,
batch-duplicate and hook-type reports are subscriptions to their diagnostic
kinds, all removed on `teardown`. Each refusal and report keeps its message
and logger channel.

The re-exported `RouterValidator` type loses its `plugins` namespace; code
typed against it registers checks and diagnostics instead, as
`@real-router/core` describes.

⚑ **One count, two halves.** The limit refuses at
`usePlugin:count`, and the `warn` / `error` thresholds are logged from
`USE_PLUGIN_COUNT`. Core asks the position first, so a call refused at the
limit logs nothing.
