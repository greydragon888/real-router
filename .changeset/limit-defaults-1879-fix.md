---
"@real-router/validation-plugin": patch
---

Core's limit defaults are mirrored once, and the mirror is pinned (#1879)

The plugin re-derived core's `DEFAULT_LIMITS` as eight literals across five
files. The values agreed, so nothing was broken — but measured on the pre-fix
tree, mutating one of the plugin's eight literals reddened **nothing** at four of
them, and mutating one of core's five defaults reddened nothing for
`warnListeners` and `maxLifecycleHandlers`.

All eight now read `CORE_LIMIT_DEFAULTS` from `helpers.ts`, and
`limit-defaults-authority-1879.test.ts` pins it against what core **enforces** —
the resolved bag on a router built with no `limits` — rather than against core's
source text. Every drift direction reds it: each of core's five values, the
plugin's table, a member added or dropped from it, and a literal re-inlined at
any of the eight call sites.

Types now come from core wherever core publishes them: `LimitsConfig` keys the
range table in `validators/options.ts`, `ForwardToCallback` is imported by
`validators/routes.ts`, and `EventName` / `EventMethodMap` are re-exported from
`validators/eventBus.ts` so the rest of the plugin keeps naming them there. All
three were local copies carrying the comment *"@real-router/types is not a direct
dependency of this package"* — `@real-router/core` is one, and publishes all
three. `RouteConfigLike` stays hand-written: `forwardMap` appears nowhere in
`@real-router/core/types`.

⚑ Keying the range table by core's own interface is not tidiness. A limit core
adds and that table does not was not an unvalidated limit — `validateLimits`
rejected it as `unknown limit`, refusing a legitimate option. That is the
`plugin ⊇ core` false-reject of #1224 / #1225, and it is now a TS2741 at the
table instead.

No behaviour change: the values are the same, `src/index.ts` is untouched, and
core keeps `DEFAULT_LIMITS` internal.
