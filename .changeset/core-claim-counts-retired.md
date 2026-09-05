---
"@real-router/core": patch
---

Nine docblocks carried counts that had stopped being true — four of them stated the wrong thing, not a stale number (#2126)

Each is retired the way `CLAUDE.md` asks — by naming the authority, or by dropping a count the paragraph never needed — rather than by writing today's figure, which only restarts the clock.

- `channels/index.ts` said "the twelve call sites" and pointed at `./CLAUDE.md` in the same sentence; that file counts sixteen across ten modules. The count is gone, the pointer stays and now says it counts rather than recalls.
- `routesStore.ts` said "five predicates across four packages"; the canonical ancestor-by-prefix shape stands ten times across five. The number also contradicted its own paragraph, which argues the reading sites "are not enumerable".
- `pipeline/port.ts` said `queryNames` has "three consumers". The channel guard is a fourth; it joins the list and the list loses its count.
- `EventBusNamespace.ts` said "`CANCEL` / `FAIL` — the two edges with no `update`". True of that row, false of the table, which carries eight. The scope is now stated.
- `types/index.ts` said "every adapter's `useRouteNode`" — Angular's is `injectRouteNode`. The surface holds; the name did not.
- `RouteLifecycleNamespace.ts` named `cloneRouter` as the second consumer of the factory records. `cloneRouter` reaches them through `getFactoriesByOrigin`, a different method — the two axes are real, the attribution was not.
- `StateNamespace.ts` said "both call sites pass four" of `PluginApi.makeState`. There are three, and the count was never the argument: the type has four required parameters, so a fourth argument is mandatory rather than customary.
- `RouterLifecycleNamespace.ts` restated `handleNavigateError`'s measurement as "115 red tests" — one of three copies of that figure. It now names the docstring that owns it.
- `RouterError.ts` dropped a frozen mutation total (`38 tests red`, unstable across runs) and a sweep size (`1959 files`, reproducible at no scope), and a `hasField` note that counted "1 of its 4 worked examples" against a docstring showing three.
