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

Three consequences of that, all measured and none of them obvious:

- **The divergence was NOT update-only.** At registration `Object.entries(route)` materialises every
  value before the filter runs, so the bag got read #1 while the config got read #3:
  `createRouter` with the same getter gave `config {"page":"3"}` / bag `{"defaultSearch":{"page":"1"}}`.
  The fix closes that half too. ⚠ It does **not** reduce the registration read count — that path
  still invokes the getter three times, exactly as it does for `defaultParams`; a pre-existing
  asymmetry with `update`, where the "user getter called once" invariant is asserted.
- **The sharpest form was a ghost.** A getter answering `null` on read #1 and a value on read #2
  cleared the config the URL is built from *while* the bag gained a value for it:
  `config undefined` / bag `{"defaultSearch":{"page":"9"}}` / `buildPath` `/a`. Now both are empty.
- **A throw channel disappeared, and that is a behaviour change.** A getter that threw on its
  SECOND read used to abort the whole update atomically (nothing written, not even the sibling
  `defaultParams` in the same patch); it now succeeds, because there is no second read. The old
  refusal was an artefact of the bug rather than a contract, but an input that used to be rejected
  is accepted now, and the read-count test is what pins the mechanism.

**And one thing the fix GAVE.** The `defaultSearch` value object had TWO aliases across a
`cloneRouter` boundary — through `config.defaultSearch` and through the bag, which clones share by
reference. Writing through `getPluginApi(clone).getRouteConfig("a").defaultSearch` used to mutate
the base router's query defaults (and the caller's own literal); that path is now unreachable. A
cross-request SSR leak, closed as a side effect of the classification.

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
in-repo consumer is affected — the three shipped plugin consumers read by KEY
(`lifecycle-plugin`'s `config?.[hookName]`, `preload-plugin`'s `config?.preload`,
`search-schema-plugin`'s `?.searchSchema`), and the only whole-bag readers in the
repo are two frozen audit probes under `benchmarks/`, neither of which registers a
`defaultSearch`. `search-schema-plugin` already reads the field through the routes
API rather than the bag.

**The list is now bound to the type it mirrors.** It must equal the members `Route`
DECLARES in `types/router.ts` — lexically, so a plugin's own augmentation stays a
custom field — and `route-key-authority-1738.test.ts` locks both directions:

- a declared field missing from the set leaks into the bag, and a newly declared
  field with no test fixture fails the coverage assertion by name, so the next
  channel-shaped field cannot be forgotten the same way;
- a PHANTOM key in the set swallows a plugin field of that name — measured,
  planting `"preload"` there leaves 4196 of 4197 core tests green while
  `@real-router/preload-plugin` breaks, so nothing else in core would notice.
