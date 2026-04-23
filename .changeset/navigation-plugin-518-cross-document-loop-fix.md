---
"@real-router/navigation-plugin": patch
---

Fix cross-document reload loop under router-syncing navigation events (#518)

When the plugin's `onTransitionSuccess` hook called `browser.navigate()` to sync
the URL after a successful transition, the dispatched `navigate` event was
short-circuited by the handler via a bare `return` while `isSyncingFromRouter`
was `true`. Per the Navigation API spec, a same-origin `canIntercept` event
with **no** `event.intercept()` call falls back to a cross-document navigation
(full page reload). In headless Chromium (Playwright + `vite preview`) this
triggered an infinite loop: every reload re-ran the app bootstrap, which
re-entered the same `browser.navigate → navigate event → bare return → reload`
cycle hundreds of times per second. `page.goto()` could never reach the `load`
event, breaking Playwright e2e for every example that relied on the plugin
(e.g. `examples/tauri/react-navigation`).

The handler now calls `event.intercept({ handler: async () => {} })` on the
syncing branch — cancelling the cross-document fallback without running any
router logic (state is already committed). Non-syncing events keep their
previous behaviour.

The bug was invisible to the existing test suite because `MockNavigation` did
not model the cross-document fallback — an un-intercepted event was silently
committed rather than producing the observable reload. `MockNavigation` now
has an opt-in `enableStrictIntercept()` mode that mirrors Chromium's behaviour,
and the fix is covered by four new regression tests under `#518`.
