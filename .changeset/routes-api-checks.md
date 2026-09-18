---
"@real-router/core": minor
---

Route CRUD stops consulting the validator, and `RouterValidator` loses eleven members (#2388)

`getRoutesApi`'s six doors register their refusals on the check channel, at six
new positions: `addRoute:batch`, `replaceRoutes:batch`, `removeRoute:entry`,
`updateRoute:entry`, `hasRoute:entry` and `getRoute:entry`. Messages and order
are unchanged.

**Eleven members leave `RouterValidator`** — every one whose only consultations
were on this surface: `validateAddRouteArgs`, `validateRoutes`,
`validateRemoveRouteArgs`, `validateUpdateRouteBasicArgs`,
`validateUpdateRoutePropertyTypes`, `validateUpdateRoute`, `validateParentOption`,
`throwIfInternalRoute`, `throwIfInternalRouteInArray`, `guardRouteCallbacks` and
`guardNoAsyncCallbacks`.

`guards.ts`'s `guardRouteCallbacks` helper is **deleted**. It existed only to
thread the validator into a per-route walk; the walk is the checking plugin's
now.

⚑ **`:batch`, not `:entry`.** `add` and `replace` hand over the array
`guardRouteStructure` snapshotted, never the caller's — judged and snapshotted in
one walk so guards, checks and registration all decide from one object
(#1899 / #1911 / #2139). The position name says which object a check receives.

⚠ **`validateRouteName` stays.** It has seven consultations and only two were
here; `hasRoute` and `getRoute` reach it through a check now, `isActiveRoute` and
the lifecycle doors still consult it.
