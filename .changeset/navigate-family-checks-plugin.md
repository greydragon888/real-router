---
"@real-router/validation-plugin": minor
---

The `navigate` family's refusals are registered as checks (#2388)

Four more registrations at install, all removed on `teardown`:
`canNavigateTo:entry`, `canNavigateTo:params`, `navigate:entry` and
`navigate:params`. Each entry check runs the door's calls in the order core
consulted them, so the first refusal a caller hears about is the same one.

`RouterValidator` loses `navigation.validateParams` and
`navigation.validateNavigateArgs` — core has no consultation left for either.
The underlying validator functions are unchanged and now run from the checks.
