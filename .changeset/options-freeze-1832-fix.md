---
"@real-router/core": minor
---

Core freezes the options level it owns, and stops freezing the caller's bags below it ([#1832](https://github.com/greydragon888/real-router/issues/1832))

`OptionsNamespace` copies the top level of your options into a literal of its own
and freezes that. It used to keep walking, calling `Object.freeze` on the bags
one level down — objects it does not own, aliased by reference under the
one-level copy model (#1958). It now stops at its own level.

⚠ **Behaviour change.** `getOptions().defaultParams` / `.defaultSearch` /
`.queryParams` / `.limits` are your objects and are no longer frozen, so a write
after construction is accepted where a plain bag used to throw. What that write
then does is unchanged and was never uniform: `defaultParams` and
`defaultSearch` are read live, `queryParams` was snapshotted at construction.
Freeze your own bag before passing it if you want the old refusal.

**Why the freeze went rather than widened.** Which bags it reached was decided by
asking each one for its `constructor`, so the same caller code sorted differently
by carrier: a plain object froze, a null-prototype bag did not, and a
null-prototype bag carrying an own `constructor: Object` froze again. What it
bought was already illusory for the idiomatic shape — an array inside a frozen
bag was never itself frozen, so a `push` moved what the router navigates to, and
moved it for every router built from that one bag.

Two things fall out with it. Core no longer reads `constructor` off a
caller-supplied object, a slot an application can back with code. And a
construction that is REFUSED — a duplicate route name, a bad path — no longer
leaves your bag frozen, so you can repair the option you were just told about.

`deepFreeze` is deleted; nothing outside `OptionsNamespace` consumed it.
