---
"@real-router/validation-plugin": patch
---

Reports a defaults bag mutated after `createRouter()`, which core cannot (#2148)

Core copies `defaultParams` and `defaultSearch` at construction (#2171), so an
application that mutates one afterwards keeps running and simply stops having any
effect — no throw, no warning, no type error. Core stays silent by decision: it
is the layer that degrades, and this is the layer that reports
(`packages/core/CLAUDE.md` › Supported Input Shapes).

Reported once per slot, on the first `navigateToDefault()` after the mutation:

> mutating `defaultParams` after createRouter() no longer affects routing — the
> router copied it at construction. Use the callback form
> (`defaultParams: () => ({ … })`), which is resolved at the point of use.

The replacement it names is not a workaround: both slots already accept a
callback, resolved at the point of use, so an application that wants a live value
has a supported mechanism.

⚠ The comparison baseline is the bag AS THE APPLICATION HANDED IT, snapshotted at
install — never core's adopted copy. That copy is normalised, with an own
`__proto__` dropped on the way in (#1957), so comparing against it reports a bag
nobody touched: a `JSON.parse`-shaped config would be told it mutated before the
application did anything.

The check runs on the one door that reads these slots, so an application that
never calls `navigateToDefault()` is never charged for it, and a bag the
application has since dropped reports nothing — there is no mutation left to
make.
