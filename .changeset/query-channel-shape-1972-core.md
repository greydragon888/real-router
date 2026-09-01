---
"@real-router/core": minor
---

Every door that takes both channels asks the validator about both (#1972)

`RouterValidator.navigation` declared `validateParams` and no query twin, so the
seven doors that take a `search` argument called the validator about the path bag
only. With `@real-router/validation-plugin` installed, a string `search` still
spread character by character into `state.search` and into the URL, while the
same junk in the params slot threw.

The slot is added and called at all seven: `buildPath`, `canNavigateTo`,
`navigate`, `isActiveRoute` on the facade, and `makeState`,
`buildNavigationState`, `forwardState` on the plugin API. Bare core is unchanged
— the check runs through `ctx.validator?.`, so a router without the plugin
behaves exactly as before.

⚠ Four of those seven are not in the issue's own count, which enumerated
`validateParams` call sites: `isActiveRoute` and `makeState` validate the path
bag through a different validator, and `buildNavigationState` / `forwardState`
are plugin-API doors nothing had counted. The door set is now classified against
a snapshot of both public surfaces, in the plugin's
`both-channels-authority-1972`, so a new member reds until someone says which
side of the question it is on.

`minor`, not `patch`: `RouterValidator` gains a required member, so an
implementation of that interface outside this repository stops compiling until
it adds one.
