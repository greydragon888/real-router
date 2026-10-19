---
"@real-router/lifecycle-plugin": patch
---

`onLeave` runs only for a navigation that commits (#2691)

`onLeave` ran at leave-approve, before the activation guards, so a navigation that then did not commit — refused by `canActivate`, failed by a throwing guard or `subscribeLeave` listener, failed because its target was removed, or cancelled by its `signal`, a newer navigation or `stop()` — left the user on a route whose cleanup had already run, and a cancelled navigation followed by one that committed ran it twice. `onLeave` now runs from `onTransitionSuccess`, before the target's `onEnter` and `onNavigate`, and a navigation that does not commit runs no hook.

Running on the commit also means:

- `router.getState()` inside `onLeave` returns the target; the route being left is the hook's `fromState`.
- A `router.subscribe` listener or a plugin registered before this one sees the commit before `onLeave` runs, and every `subscribeLeave` listener, awaited ones included, runs before it.
- `onLeave` can no longer cancel its navigation: `router.stop()`, `router.dispose()` or aborting the navigation's `signal` from inside it acts after the commit.
- `onLeave` runs for a `navigateToNotFound()` commit, and for a `getRoutesApi(router).replace()` that gives the active route a new path while another route takes the old one.
- The hook is read from the route's definition at the commit, so a commit listener registered before this plugin that removes the route just left takes `onLeave` away.

Work that has to happen before the commit, or be undone when the navigation does not commit, belongs in `router.subscribeLeave`, whose `signal` aborts in that case.
