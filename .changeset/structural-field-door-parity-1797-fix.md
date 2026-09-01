---
"@real-router/core": minor
---

One declaration, one route config — through every door (#1797)

Registration gates every structural field on TRUTHINESS
(`registerSingleRouteHandlers`), while `update` adopted on presence. The same
declaration therefore produced two different configs, and
`getRoutesApi(router).get(name)` — whose output is meant to round-trip back
through `add()` — disagreed about whether the field exists at all.

`update` now adopts a field on the same terms registration does. No VALID value
of any of the seven is falsy: a forward target is a non-empty route name, the
two default bags are objects, the codecs and guard factories are functions.

⚠ The values this stops storing are type-invalid — TypeScript refuses every one
of them — but what they did once stored is measured, not stylistic:

```
update({ decodeParams: 0 })  →  matchPath throws "decoder is not a function"
update({ encodeParams: 0 })  →  buildPath throws "encoder is not a function"
update({ canActivate: false })  →  every navigation to the route is blocked
```

The fourth is quieter and is the one the issue is named after:
`update({ forwardTo: "" })` puts `a → ""` in the forward map, where the chain
walk's own truthiness test stops it, so the route resolves to itself. `buildPath`
prints the same URL either way — what diverges is `get("a").forwardTo`, which
answers `""` where the identical declaration through `add` answers nothing.

`match()` may not throw on input, and its callers in the browser, hash,
navigation and SSR packages do not catch.

`null` still removes a field and `undefined` still says nothing; both are
pinned. A junk patch now emits no `TREE_CHANGED`, because nothing changed.

`minor`, not `patch`: `update({ canActivate: 0 })` threw before and is now a
silent no-op, so core is laxer at that one point. ⚠ Measured, the opt-in
validator does NOT cover it: with `validationPlugin()` installed, `update` still
accepts a falsy `canActivate` / `canDeactivate` / `defaultSearch` without a word
(it does report `forwardTo`, `defaultParams` and the two codecs). Refusing by
TYPE is that plugin's job and the gap is tracked in #1787 — until it closes,
these three fields are diagnosed by neither layer.
