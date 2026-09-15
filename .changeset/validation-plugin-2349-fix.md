---
"@real-router/validation-plugin": minor
---

One router, one validator — a second registration is now refused (#2349)

`RouterInternals.validator` is a single slot and `teardown` clears it, so a
router carrying two registrations of this plugin has a teardown that switches
validation off while a plugin is still registered. Measured on three arms — two
registrations and remove the first, remove the second, remove the middle of
three — every one ends with the router registered and unvalidated, against a
single-registration control that still validates.

A registration that finds the slot occupied now throws
`RouterError("VALIDATION_PLUGIN_ALREADY_INSTALLED")` instead of overwriting the
first validator.

**Breaking, and the one shape to check is the clone.** `cloneRouter` re-runs the
base's plugin factories, so a clone — the per-request scope an SSR setup builds
— already carries its own validator. Code that registered the plugin on the
clone as well now throws; delete that registration. The clone was already
validated before this change, so nothing is lost.

Re-registering after `teardown()` still works: the refusal reads the slot, not a
tally of registrations, so an emptied slot accepts a new validator.
