---
"@real-router/validation-plugin": patch
---

`update()` refuses an unavailable-params `forwardTo` under its own door name (#2399)

`getRoutesApi(router).update("r", { forwardTo: "u" })`, where `u` needs a path
param `r` does not carry, threw
`[router.addRoute] forwardTo target "u" requires params [id] …`. The prefix names
the call a reader can grep in their own code, and this one named a door the
caller never used — the neighbouring refusal from the same door,
`forwardTo target "…" does not exist`, already said `[router.updateRoute]`.

The message now reads `[router.updateRoute]`; nothing else about it changes, and
the error stays an `Error`.

The batch doors are untouched: `add` and `replace` still print
`[router.addRoute]` for the same defect, which is core's recorded decision that
every batch door reports that one name. A cell per door of the `RoutesApi`
surface now pins which door a refusal names, and what it says.
