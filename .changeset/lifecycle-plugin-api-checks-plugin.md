---
"@real-router/validation-plugin": minor
---

The lifecycle and state-builder refusals are registered as checks (#2388)

Six more registrations at install, all removed on `teardown`.
`RouterValidator` loses `lifecycle.validateHandler`; core has no consultation
left for it.

⚠ `lifecycle.validateCountThresholds` stays on the validator and could not move
with them: measured, it never throws — it is one of the diagnostics the emitter
half of #2388 takes, and the check channel is refusal-only.

⚠ The new cells use a WHITESPACE route name. A number is refused by core's own
`assertRouteNameIsString` before the check runs, and an empty name is valid — it
is the root node — so neither reaches the registration.
