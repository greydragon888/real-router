---
"@real-router/svelte": patch
---

fix(svelte): `<RouteView>` chose a slot the component never declared (#1853)

`getActiveSegment` picked the active slot by walking the snippet bag with
`for…in`, and its only filter was a value check for the reserved `self` /
`notFound` names. That walk reports every enumerable member of
`Object.prototype`, which an ordinary library extension puts there — no attacker
required — so an undeclared name became a candidate slot. When it matched the
current route, `RouteView` indexed the bag with it, resolved the inherited value
through the chain, and rendered it: `TypeError: snippet is not a function`.

The walk now goes over `Object.keys`.

⚠ `Object.hasOwn` does **not** close this, which is worth knowing before anyone
simplifies it back. The bag is the rest of `$props()`, and it answers
`getOwnPropertyNames` and `Object.hasOwn` differently for the same key — its
descriptor lookup reads through to the source props while its own-keys list does
not. A `hasOwn` gate is therefore told `true` for the inherited name and lets it
past. `Object.keys` consults the own-keys list first and never puts such a name
to the descriptor lookup at all.

svelte is the only adapter exposed, and structurally so: its slots arrive as an
object because Svelte 5 snippets are named props, where the other five walk a
children tree or an array.
