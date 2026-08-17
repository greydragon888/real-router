---
"@real-router/core": minor
---

`defaultSearch` is a standard route key, not a plugin custom field (#1738)

`STANDARD_ROUTE_KEYS` decides which route-definition keys are core's structural
config and which are plugin-defined **custom fields** exposed through
`getPluginApi(router).getRouteConfig(name)`. It listed nine keys and not
`defaultSearch` — the query-channel twin of `defaultParams`, added to the `Route`
type by RFC-4 M2 (#1548) — so across 33 core releases (it shipped in 0.82.0) a core config field was stored in
the plugin bag, at every entry point: `createRouter`, `add`, `replace`, `update`.

**The consequence was more than a misfiled key, and the issue's own "no
user-visible defect right now" is refuted by measurement.** `prepareCustomFields`
reads the VALUE of every patch key the set does not know; that guard exists
precisely so a structural getter — already read once by `commitRouteUpdate`'s
destructuring — is not read a second time. With `defaultSearch` outside the set an
accessor-backed patch was read TWICE and the two reads landed in DIFFERENT places:

```
update("q", { get defaultSearch() { return { page: String(++reads) } } })
  before: reads=2 · config {"page":"1"} · getRouteConfig {"defaultSearch":{"page":"2"}}
  after:  reads=1 · config {"page":"1"} · getRouteConfig undefined
```

**Carriage is unchanged, and membership was never what carried the field.**
`add` / `replace` / `update` / `setRootPath` / `cloneRouter` still apply it,
`update({ defaultSearch })` still emits the structural `TREE_CHANGED`, `buildPath`
still reflects the patch, `null` still clears it, and a child route declaring it is
handled the same — each measured. The issue expected the explicit branches to
"become redundant"; they do not, and the doc comment now says so: this set decides
CLASSIFICATION only, while `registerSingleRouteHandlers` and `commitScalarConfig`
are what write the config.

⚠ **Breaking for anyone reading the field out of the plugin bag.**
`getRouteConfig(name).defaultSearch` is now `undefined`, and for a route whose only
extra field was `defaultSearch` the whole call returns `undefined` instead of an
object. Read a route's own config through `getRoutesApi(router).get(name)`. No
in-repo consumer is affected: all three (`lifecycle-plugin`, `preload-plugin`,
`search-schema-plugin`) access the bag by key, and `search-schema-plugin` already
reads `defaultSearch` through the routes API.

**The list is now bound to the type it mirrors.** It must equal the members `Route`
DECLARES in `types/router.ts` — lexically, so a plugin's own augmentation stays a
custom field — and `route-key-authority-1738.test.ts` locks both directions:

- a declared field missing from the set leaks into the bag, and a newly declared
  field with no test fixture fails the coverage assertion by name, so the next
  channel-shaped field cannot be forgotten the same way;
- a PHANTOM key in the set swallows a plugin field of that name — measured,
  planting `"preload"` there leaves 4196 of 4197 core tests green while
  `@real-router/preload-plugin` breaks, so nothing else in core would notice.
