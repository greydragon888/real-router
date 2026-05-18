---
"@real-router/solid": patch
---

Guard against throwing `getAnnouncementText` in `createRouteAnnouncer` (#628)

A user-provided `getAnnouncementText` callback that throws was propagating
the exception up through `router.subscribe`'s listener loop, tearing down
sibling listeners and breaking navigation tracking elsewhere. The shared
`resolveText` helper now wraps the callback in try/catch, logs the error
via `console.error` with a `[real-router]` prefix, and falls through to
the built-in resolution chain (`<h1>` textContent → `document.title` →
route name → pathname).

User-visible effect: a buggy custom announcer resolver no longer breaks
router subscriptions — the announcer announces the fallback text and
logs the underlying error so the bug surfaces in dev tools.

Discovered during the React audit (`review-2026-05-10` §5.7, MED
severity). Applied to `shared/dom-utils/route-announcer.ts` and the
git-tracked Angular copy.
