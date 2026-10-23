---
"@real-router/core": minor
---

Log each message under the call that reached it, or under bare `router` where several calls reach it (#2821)

A `replace()` refused while a navigation was in flight logged `[router.clear] Cannot clear routes while navigation is in progress…` — the channel and the wording of `clear()`, a call the application never made. It now logs its own refusal. The other messages below named one call while several reached them, and change channel too:

| message                                                                                                                               | before                                                                | after                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `replace()` refused mid-navigation                                                                                                    | `[router.clear] Cannot clear routes while navigation is in progress…` | `[router.replace] Cannot replace routes while navigation is in progress…` |
| `Guard for "…" threw — treated as navigation-blocking (returned false)`, when `navigateToNotFound()` or `replace()` asked the guard   | `router.canNavigateTo`                                                | `router.navigateToNotFound` / `router.replace`                            |
| `Guard for "…" returned a Promise…` from `@real-router/validation-plugin`, when `navigateToNotFound()` or `replace()` asked the guard | `router.canNavigateTo`                                                | `router.navigateToNotFound` / `router.replace`                            |
| `Unexpected navigation error`                                                                                                         | `router.navigate`                                                     | `router`                                                                  |
| `Concurrent navigation detected on shared router instance…`                                                                           | `router.navigate`                                                     | `router`                                                                  |
| `Event "…" has N listeners — possible memory leak` (`limits.warnListeners`)                                                           | `router.addEventListener`                                             | `router`                                                                  |
| `Error during cleanup:` — a plugin's `teardown` threw                                                                                 | `router.usePlugin`                                                    | `router`                                                                  |
| `N listeners registered for "…"` from `@real-router/validation-plugin`, for a plugin's hooks                                          | `router.addEventListener`                                             | `router.usePlugin`                                                        |

The four that become bare `router` are raised where several calls meet — the navigating calls; `subscribe`, `usePlugin` and `subscribeChanges` registrations alike; the unsubscribe `usePlugin` returns as well as `dispose()` — so one call's name would be false at the others. The rest now name the call that reached them: core hands the calling door down to the guard check and, for a plugin's hooks, to the listener count. A guard asked by `canNavigateTo()` itself still logs under `router.canNavigateTo`.

**Breaking Change:** each message leaves its old channel in the case its row names, so a `logger.callback` filtering on that channel stops seeing it there. Core logs nothing under `router.navigate` or `router.addEventListener` any more.

**Migration:** filter on the new channel; where it is bare `router`, match the message as well, because that channel carries other messages:

```diff
- if (context === "router.navigate") report(message);
+ if (
+   context === "router" &&
+   (message.startsWith("Unexpected navigation error") ||
+     message.startsWith("Concurrent navigation detected"))
+ ) {
+   report(message);
+ }
```
