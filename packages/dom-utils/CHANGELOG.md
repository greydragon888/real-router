# dom-utils

## 0.2.0

### Minor Changes

- Add shared Link utilities: `shouldNavigate`, `buildHref`, `buildActiveClassName`, `applyLinkA11y` (#342)

  Extracted from 5 adapter `utils.ts` files and 3 directives into a single source of truth. Eliminates ~180 lines of duplicated code across adapters.

## 0.1.0

### Minor Changes

- Initial release: `createRouteAnnouncer` — WCAG-compliant screen reader announcements for SPA route changes (#337)

  Singleton `aria-live="assertive"` region, focus on `<h1>`, double rAF timing, Safari 100ms delay, dedup, auto-clear 7s, customizable text via `getAnnouncementText` callback.
