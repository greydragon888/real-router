---
"@real-router/validation-plugin": minor
---

The first diagnostic is delivered by subscription, not by a validator method (#2388)

The plugin subscribes to `PLUGIN_AFTER_START` at install and unsubscribes on
`teardown`. The warning itself is unchanged — same function, same wording, same
trigger — and `plugin-api.validation.test.ts` proves it: deleting the
subscription reddens a cell written long before this conversion.

`RouterValidator` loses `plugins.warnPluginAfterStart`; core has no consultation
left for it.
