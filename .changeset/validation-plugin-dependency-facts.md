---
"@real-router/validation-plugin": patch
---

Follow core's validators onto facts (#2382)

The two wrappers take the numbers and the value core already holds, so the plugin
unpacks no store for them. `validateDependencyCount` judges the count and the
limit it is given; the resolved limit comes from `createLimits`, so the plugin
carries no default of its own on this path — `limits.test.ts` › _"should enforce
default maxDependencies limit (100)"_ owns that number through the public door.

`validateParentOption` and `validateResolvedDefaultRoute` read the tree from
`PluginApi.getTree()`. The retrospective default-route check reads it there too,
so it no longer demands a whole routes store — `definitions`, `config` and
`tree` — to consult one of them.

`validateRoutes` and `validateUpdateRoute` ask their questions about existing
routes through a `RouteLookup`: existence walks `PluginApi.getTree()`, and path
slots come from `PluginApi.getUrlParams`. The forward map they check for cycles is
`PluginApi.getForwardMap()`. The route matcher is not handed to these validators,
and the path-slot walk they need lives in core.

The retrospective pass at `usePlugin()` takes facts as well. Routes come from
`getRoutesApi(router).get`, and the forward map, resolved limits, dependency names
and external guard names from `PluginApi`; the batch limit on `setDependencies`
reads the dependency names and the resolved limit there too. The one core record
the plugin reads is the dependency record, for the getter check. Its local
mirrors of core's route-config and limit types are gone, and with them their rows
in `core-union-mirror-authority-2091`.

Behaviour is identical — same refusals, same messages, same thresholds — with one
ordering detail: when several routes carry a bad default bag, the route named
first follows the route tree's order.
