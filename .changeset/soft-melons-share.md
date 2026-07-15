---
"@real-router/solid": patch
---

Fix `use:link` opening a duplicate active-route source for no-params links

The `use:link` directive fed the `EMPTY_PARAMS` (`{}`) default into `createActiveRouteSource` instead of the raw `routeParams`, keying the sources cache as `"{}"` instead of the canonical `""` (the #776 adapter contract). A no-params `use:link` with `activeClassName` therefore opened a second cached source and a second router subscription for the same question a sibling `<Link>` already answered. The active-state result is unchanged — the fix restores the single shared subscription. (#1438)
