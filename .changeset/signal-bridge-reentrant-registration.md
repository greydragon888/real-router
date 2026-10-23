---
"@real-router/core": patch
---

A signal listener whose registration cancels its navigation is removed (#2786)

The router registers an `abort` listener on a navigation's `opts.signal` through `signal.addEventListener`. When that method started another navigation or called `router.stop()`, the navigation was cancelled before the router could remove the listener: it stayed on the signal, and a later `abort()` of that signal cancelled whichever navigation the router was running by then. The router now removes it as soon as the registration returns.
