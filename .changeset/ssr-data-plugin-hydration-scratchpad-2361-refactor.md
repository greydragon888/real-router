---
"@real-router/ssr-data-plugin": minor
---

The post-hydration loader skip reads `@real-router/ssr-utils`' scratchpad, which is now a dependency (#2361)

The plugin reads the state `hydrateRouter` deposited through
`getHydrationState(router)` instead of core's internals, and
`@real-router/ssr-utils` moves from `devDependencies` to `dependencies`.
Behaviour is unchanged, with one condition: `hydrateRouter` and the plugin must
resolve the same copy of `@real-router/ssr-utils`. Two copies — for example an
application pinning its own `@real-router/ssr-utils` to a different minor —
hold two scratchpads, and the loader then re-runs on first paint without an
error. Update `@real-router/ssr-utils` together with this plugin.
