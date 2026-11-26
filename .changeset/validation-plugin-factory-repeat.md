---
"@real-router/validation-plugin": minor
---

Stop refusing a plugin factory an earlier `usePlugin` call registered (#2974)

The check behind `[router.usePlugin] Plugin factory already registered…` is
removed, so this plugin no longer stops a second `usePlugin` of the same factory
object. Every `@real-router/*` plugin refuses its own repeat registration itself,
with this plugin or without it. A repeat of another plugin is accepted unless
that plugin refuses it or core refuses what its first instance already holds: a
`state.context` namespace, a router property, a hook function both instances
share, a route name.

The warning about a factory repeated inside one `usePlugin(f, f)` call stays,
and so does this plugin's refusal of its own second installation
(`VALIDATION_PLUGIN_ALREADY_INSTALLED`).

**Breaking Change:** a plugin of your own that must not run twice on one router
refuses the repeat itself: keep a module-level `WeakSet` of the routers it is
registered on, check it in the factory before anything is registered, add the
router after the last call that may throw, and delete it in `teardown`.
