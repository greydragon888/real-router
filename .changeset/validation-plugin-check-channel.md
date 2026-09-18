---
"@real-router/validation-plugin": minor
---

Both printers' param-value walks are registered as checks, not consulted as validator methods (#2388)

The plugin registers `addCheck("buildPath:params", …)` and
`addCheck("buildPathResolved:params", …)` at installation and removes both on
`teardown`. The refusals themselves are unchanged — same function, same
messages, same inputs — so no application behaviour moves.

⚠ The SHAPE half stays on `RouterValidator`. `validateNavigateParamsShape` must
judge the caller's bag before core copies, because a copy launders every shape it
exists to refuse; only the VALUE half has an object worth moving, and that object
is core's own copy (#2134).

⚠ `teardown` must remove the registration, and now does. Nulling `ctx.validator`
silences every other door and does nothing to a channel registration, so a leak
would leave a torn-down plugin still refusing.
