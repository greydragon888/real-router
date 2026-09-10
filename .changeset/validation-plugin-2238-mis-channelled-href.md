---
"@real-router/validation-plugin": minor
---

Report the retired single-bag spelling at the two doors that stay silent about it (#2238)

A declared QUERY name carrying a value in the `params` bag is the v1 spelling the
channel split retired. The committing doors already answer — `navigate` throws
`WRONG_CHANNEL`, `canNavigateTo` returns `false` — but `buildPath` prints an href
without the key and `isActiveRoute` judges the location that href describes.

⚠ **The silence only reaches paths that never click.** Measured: a plain
left-click throws a synchronous `TypeError` that escapes `<Link>`'s own
`.catch(() => {})`. What follows the wrong href instead is ⌘/ctrl/shift/middle-click
(`shouldNavigate` returns `false` for each), `target="_blank"`, a copied link, and
server-rendered markup.

⚠ **The defaulted case loses BOTH values.** On `{ path: "/d?page", defaultSearch: { page: "1" } }`,
`buildPath("d", { page: "2" })` prints `/d` — `withholdFilledSlots` declines the
default and the path channel never prints the caller's. With
`persistent-params` a value is SUBSTITUTED instead: the persisted one prints where
the caller's was expected.

A warning, not a throw: neither door has an error channel, and #2124 measured that
wiring core's guard here changes an ANSWER rather than revealing a silence.
De-duplicated per route + key on a cache owned by the validator object (#1583).
The predicate comes from core rather than a copy — a mirrored rule already drifted
once in this package (#1224 / #1225).
