---
"@real-router/memory-plugin": minor
---

A `back()`, `forward()` or `go()` that a newer `navigate()` cancels leaves the stack to that navigation's end (#2802)

The stack stopped following a restore once the restore's navigation rejected. A `navigate()` that cancelled a held restore therefore pushed after the restore's target when it committed at once, and after the entry the router shows when it committed after an async guard of its own.

- The position now stays on the restore's target until the newer navigation ends. Its commit applies to that entry whenever it commits — a push truncates after it, a replace overwrites it; its refusal, or a cancel with nothing newer behind it, leaves the stack on the entry the router shows.
- A redirect a `TRANSITION_ERROR` or `TRANSITION_CANCEL` listener starts in a microtask after that refusal or cancel — or after the refusal of a `navigate()` that cancels the newer one and that a guard refuses at once — is newer still: its commit lands past the restore's target as well, where it landed past the entry the router shows once it started after the restore's rejection was handled. A redirect from a listener registered after the restore's cancel lands past the entry the router shows.
- So does a navigation started after a guard cancels the restore quietly — a redirect a `TRANSITION_CANCEL` listener starts in a microtask, or a `navigate()` the caller of `back()` makes right after a guard cancels it at once — when it commits after an async guard of its own; when a guard refuses it at once, so does a redirect a listener of that refusal starts in a microtask. One started a task later lands as before.
- The newer navigation's own `.catch()` or `await` finds the stack on the entry the router shows also when that navigation is refused, or cancelled with nothing newer behind it, within the call that cancels the restore, where it found the restore's target: a redirect it starts that commits at once lands past that entry, and `canGoForward()` and `back()` there read it. A redirect a listener of that end started that its own guard still holds, another navigation that ends later in the same task, or a listener registered before the plugin that ends that navigation inside its announce, leaves that handler the restore's target.
- From its cancel until the navigations that run after it end — or, with none, until its rejection — the restore holds one more listener of `TRANSITION_SUCCESS`, `TRANSITION_ERROR` and `TRANSITION_CANCEL`. A router whose `limits.maxListeners` leaves no room for them drops the restore at its rejection, as before.

**Breaking Change:**

- While that navigation runs, `canGoBack()`, `canGoForward()` and the next `back()`, `forward()` or `go()` read the restore's target, not the entry the router shows, which they read once the restore's rejection settled.
- The plugin registers `onTransitionError` and `onTransitionCancel` hooks, so `usePlugin()` throws on a router whose `limits.maxListeners` is reached for `TRANSITION_ERROR` or `TRANSITION_CANCEL`.

**Migration:** read `canGoBack()`/`canGoForward()` after the newer navigation settles where they must describe the entry the router shows. Under `limits.maxListeners`, leave room for one listener of `TRANSITION_ERROR` and one of `TRANSITION_CANCEL`, and for the three a waiting restore takes.
