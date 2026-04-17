---
"@real-router/solid": minor
---

Audit-driven hardening of @real-router/solid (#462)

- Share the `createRouteNodeSource` WeakMap cache between `useRouteNode` and `useRouteNodeStore` via a new internal `sharedNodeSource` helper.
- Export internal `isRouteActive` / `isSegmentMatch` helpers so property-based tests exercise the production functions instead of inline replicas.
- Replace the inline IIFE in `<RouterErrorBoundary>` with a `<Show>` boundary.
- Drop redundant `String(...)` wrappers from the Link slow-path cache key (no behavioral change).
- Document the `createRouteAnnouncer` options, Safari-ready delay, and the full `RouterContext` shape (`{ router, navigator, routeSelector }`) in CLAUDE.md and the Wiki integration guide.
- Expand test coverage: gotcha #2 (Never Destructure Props), gotcha #9 (No keepAlive disposal), every click modifier for `shouldNavigate`, Navigator surface (`subscribeLeave`, `isLeaveApproved`), `RouterErrorBoundary` `onError` reassignment, and a new 10 000-navigation long-lived subscription stress test (L1).
- **Security fix**: `RouteView.Match` / `RouteView.NotFound` markers now use local `Symbol()` instead of `Symbol.for()`. The global-registry Symbol was spoofable — any object with `$$type: Symbol.for("RouteView.Match")` would pass the marker check inside `RouteView`. Added regression tests rejecting spoofed markers.
- Gotcha-coverage negative tests: `activeStrict=true` ancestor rejection (#10), `useFastPath` decision frozen at init (#13).
- `buildActiveClassName` in `shared/dom-utils/link-utils.ts` now deduplicates tokens via a shared `parseTokens` helper; new dedupe/merge tests in `packages/dom-utils`.
- New stress tests: `RouteView` lazy-component switching with Suspense, Link modifier-keys under load, async-guards race (fast navigate during slow guard), `replaceHistoryState` during an active transition, and `getRoutesApi.remove()` mid-session with mounted Links (including 50-link burst removal).
- Fix Wiki examples: `use:link` directive value must be an accessor function (`() => ({ ... })`), not an options object — documented behavior clarified in `Solid-Integration.md`.
