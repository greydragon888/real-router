---
"@real-router/core": minor
---

The cached `getRoutesApi` surface is frozen (#1805)

`getRoutesApi(router)` caches one API object per router in a `WeakMap` and handed
it back **unfrozen**, so any consumer replacing a method on it changed that method
for every other consumer of the same router — three plugins plus 100 call sites
across the example apps, silently, with nothing for the next consumer to notice.

The realistic trigger is not adversarial: a dev-tools plugin or an
"instrument everything" line wrapping `add` to log registrations rewires the
surface for everyone downstream.

Measured across the five factory surfaces, before:

| factory | frozen | shared identity | a write reaches a second consumer |
| --- | --- | --- | --- |
| `getNavigator` | yes | yes | no — **control** |
| `getRoutesApi` | **no** | **yes** | **yes** |
| `getPluginApi` | no | yes | yes |
| `getLifecycleApi` | no | no | no — **control** |
| `getDependenciesApi` | no | no | no — **control** |

The controls at both ends are what make the gap sharp: the one cached surface that
is *named* read-only was already frozen, and the two unfrozen surfaces are built
fresh per call, so a write to them cannot travel. The defect was exactly the
quadrant that is cached **and** mutating.

⚠ **`getPluginApi` is deliberately NOT part of this change.** Freezing it costs 20
tests across `sources`, `browser-plugin`, `hash-plugin` and `navigation-plugin`,
all of which spy on the shared surface to inject errors — and `getPluginApi.ts`'s
own docblock advertises that use. It needs a migration and a docblock correction,
not a one-line freeze. `getRoutesApi`'s freeze is measured free: core, all six
adapters and every plugin reaching this door stay green.

The rule is pinned by `factory-surface-freeze-authority-1805`, which MEASURES the
caching premise rather than declaring it, and separates the two reasons a shared
surface can stay unfrozen: `getPluginApi` is a ratcheted **backlog** row that reds
the moment it is fixed, while `getInternals` on the `/validation` subpath is a
permanent **carve-out** — it hands back the live internals bag, and two of its
fields are writable on purpose (`ssr-utils/hydrateRouter.ts` fills and clears
`hydrationState`), so freezing it would break SSR hydration. That exemption is
pinned by a cell asserting the write still works, not excused in prose.
