/**
 * #1540 regression guard — root-family (`declare module "@real-router/core"`)
 * interface augmentation must survive `dist` resolution for external consumers.
 *
 * WHY HERE (not in a core script): the merge only fails when `@real-router/core`
 * resolves to `dist` (bundler resolution, no `@real-router/internal-source`).
 * Inside the monorepo every package resolves core via the `internal-source`
 * condition → `src`, where the merge always works — so a dist-only regression is
 * invisible there. This example IS an external dist-resolving consumer, and it
 * depends on all three root-augmenting plugins (lifecycle / preload /
 * search-schema), so it is the one place a real dist merge can be asserted.
 *
 * WHY A TYPE-LEVEL ASSERT (not just "does it compile"): `Route` carries a
 * `[key: string]: unknown` index signature, so a broken augmentation degrades
 * SILENTLY — the augmented field is still reachable, just typed `unknown`, and
 * ordinary example code (and #1539's PR type-check) stays green. The
 * `IsUnknown` assertions below fail the build the moment a field falls back to
 * the index signature — turning the silent degradation into a hard error.
 *
 * This is the root-family twin of `packages/core/scripts/check-dts-augment-targets.mjs`
 * (which covers the types-family: StateContext / NavigationOptions). Type-only
 * file — never imported, tree-shaken out of the bundle; only `tsc -b` sees it.
 */
import type { Route, RouteConfigUpdate } from "@real-router/core";
import "@real-router/lifecycle-plugin";
import "@real-router/preload-plugin";
import "@real-router/search-schema-plugin";

type IsUnknown<T> = [unknown] extends [T]
  ? [T] extends [unknown]
    ? true
    : false
  : false;

/** `false` = the field is typed via the plugin augmentation (merged). */
/** `true`  = the field only resolves through `[key: string]: unknown` (merge broke, #1540). */
type Merged<T> = IsUnknown<T> extends true ? false : true;

// lifecycle-plugin
const _onEnter: Merged<Route["onEnter"]> = true;
const _onStay: Merged<Route["onStay"]> = true;
const _onLeave: Merged<Route["onLeave"]> = true;
const _onNavigate: Merged<Route["onNavigate"]> = true;
const _rcuOnEnter: Merged<RouteConfigUpdate["onEnter"]> = true;
// preload-plugin
const _preload: Merged<Route["preload"]> = true;
const _rcuPreload: Merged<RouteConfigUpdate["preload"]> = true;
// search-schema-plugin
const _searchSchema: Merged<Route["searchSchema"]> = true;
const _rcuSearchSchema: Merged<RouteConfigUpdate["searchSchema"]> = true;

void [
  _onEnter,
  _onStay,
  _onLeave,
  _onNavigate,
  _rcuOnEnter,
  _preload,
  _rcuPreload,
  _searchSchema,
  _rcuSearchSchema,
];
