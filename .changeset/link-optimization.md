---
"@real-router/react": minor
---

**BREAKING:** Consolidate Link components — remove `BaseLink` and `ConnectedLink` (#258)

- `Link` now subscribes to active state via `useIsActiveRoute` — re-renders only when its own active status changes
- `BaseLink` removed — `Link` takes router from context automatically
- `ConnectedLink` removed — `Link` provides the same granular reactivity with less overhead
- `BaseLinkProps` type replaced by `LinkProps<P>`
- Removed: `data-route` and `data-active` HTML attributes
- Fix: `routeOptions` (reload, replace) now correctly passed to navigation (previously silently dropped by `Link` and `ConnectedLink`)
