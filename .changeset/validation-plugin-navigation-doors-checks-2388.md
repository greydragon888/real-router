---
"@real-router/validation-plugin": minor
---

The validation of `navigateToState`, `setRootPath`, `navigateToDefault` and `start` moves onto checks and a diagnostic ([#2388](https://github.com/greydragon888/real-router/issues/2388))

The argument refusals of the four doors are checks at their `:entry`
positions, the refusal of an unknown route name a `defaultRoute` callback
returns is a check at `navigateToDefault:route`, and the warning about a
`defaultParams` / `defaultSearch` bag mutated after `createRouter()` is a
subscription to `NAVIGATE_TO_DEFAULT`, all removed on `teardown`. Each refusal
and report keeps its message and logger channel.

The re-exported `RouterValidator` type loses its `options` namespace,
`routes.validateSetRootPathArgs` and four `navigation` members; code typed
against it registers checks and diagnostics instead, as `@real-router/core`
describes.

⚑ **The warning follows the entry refusals.** A `navigateToDefault` call whose
options carry a field the plugin refuses — `{ replace: "yes" }`, say — no
longer logs the warning about a mutated defaults bag before it throws; the
warning comes on the first call that passes. A name a `defaultRoute` callback returns is refused
after the warning, as before.
