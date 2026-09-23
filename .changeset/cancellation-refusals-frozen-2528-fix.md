---
"@real-router/core": patch
---

Four refusals that reached consumer code writable are now frozen where they are built (#2528)

Each was reachable through published API:

- `navigate()` rejected with a writable `TRANSITION_CANCELLED` when the navigation
  lost its transition before settling — a synchronous guard or `onTransitionStart`
  hook that removes the target route, or a guard that rejects just before a newer
  `navigate()` supersedes it.
- `navigate()` rejected with a writable one when the caller's own `signal` aborted
  while a `subscribeLeave` listener was still pending.
- `stop()`, `dispose()` or a superseding `navigate()` put a writable one into
  `signal.reason` for every guard and leave listener of the cancelled navigation.
  With a leave listener pending, that same object became the `navigate()`
  rejection, so a write to `signal.reason` reached the caller's `catch`.
- A route removed before the commit was reported to `$$error` listeners and
  `onTransitionError` before it was frozen, so a listener's write reached what the
  caller caught — the shape #2509 corrected at `navigateToNotFound`.

A `reason` supplied by whoever aborted is left untouched: only an error core
constructed is frozen.

⚠ **A listener or guard that wrote to one of these errors will stop having an
effect** — silently in sloppy mode, with a `TypeError` in strict mode.
