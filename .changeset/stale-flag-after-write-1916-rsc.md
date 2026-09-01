---
"@real-router/rsc-server-plugin": patch
---

The staleness flag is cleared after the write, not before it (#1916)

This package shares the `subscribeLeave` refresh path, so its `invalidate()`
channel had the same ordering: `clearStale` ran ahead of `writeLoaderResult`, and
a write that throws consumed the retry for a refresh that never happened.

⚑ The trigger is sharper here after #1917: an rsc loader returning a `defer()`
payload is now refused, and that refusal is a write that throws. Without this
ordering fix the two changes would have combined into "the navigation fails and
the retry is silently spent".
