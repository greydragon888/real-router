---
"@real-router/browser-plugin": patch
---

Reduce per-call allocation in `router.replaceHistoryState()` (#470)

Audit follow-up from `packages/browser-plugin/.claude/review-2026-04-22.md`
(section 8a.6 / 8c.6). `createReplaceHistoryState` in the shared `browser-env`
helper now creates a single mutable `{ name, params, path }` buffer via
`createUpdateBrowserState()` once per plugin instance and reuses it on every
`router.replaceHistoryState(name, params)` call. The previous implementation
allocated a fresh literal on each call — wasteful for UI-heavy flows that
replace history on every reactive state change.

Also refactors `shouldReplaceHistory` into three explicit branches, removing
the `eslint-disable @typescript-eslint/no-unnecessary-condition` comment.
Extracts the `PopstateTransitionOptions` type into `shared/browser-env` so
it is no longer duplicated inline in `browser-plugin`'s factory.

No public API changes. Documentation fixes:

- `ARCHITECTURE.md` removed the non-existent `title?: string` parameter from
  the documented `replaceHistoryState` signature.
- `README.md` SSR section rewritten — `buildUrl` / `matchUrl` are
  environment-agnostic and work in SSR (the previous text claimed the plugin
  returns "path without base", which was incorrect).
- New "Navigation Source" section describing `state.context.browser.source`
  (`"navigate"` / `"popstate"`) with the zero-allocation frozen-literal note.
