---
"@real-router/validation-plugin": minor
---

The guard and listener-count validation moves onto checks and diagnostics ([#2388](https://github.com/greydragon888/real-router/issues/2388))

The handler limit refuses at `canActivate:count` / `canDeactivate:count`, and
the count thresholds, the overwrite warning, the two reports of the synchronous
ask, the transition's non-boolean report and the listener-count thresholds are
subscriptions to their diagnostic kinds, all removed on `teardown`. Each refusal
and report keeps its message and logger channel.

The re-exported `RouterValidator` type loses its `lifecycle` and `eventBus`
namespaces; code typed against it registers checks and diagnostics instead, as
`@real-router/core` describes.

The plugin no longer checks the arguments of `addEventListener`: core refuses an
unknown event name and a non-function callback on every router, with the same
messages, before the plugin's copy could run.

⚑ **One count, two halves.** The limit refuses at the count positions, and the
`warn` / `error` thresholds are logged from `CAN_ACTIVATE_COUNT` /
`CAN_DEACTIVATE_COUNT`. Core asks the position first, so a guard refused at the
limit logs nothing.
