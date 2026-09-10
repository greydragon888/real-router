---
"@real-router/core": minor
---

`replace()`'s revalidation window refuses a navigation

A navigation started from inside that window and then FAILING left the router on
a route the new tree no longer holds — permanently, with the only signal an
exception out of `replace()` that a caller may reasonably catch and log:

```
settled: state = a @ /a
  has("a")        false
  buildPath("a")  throws
```

The revalidation that would have caught it was refused, correctly: the machine
was mid-transition and had no `SYSTEM_COMMIT` edge to take. It deferred to a
navigation that never committed, and nothing revalidated the state afterwards.

The window now refuses the navigation instead, which is the same rule its
route-CRUD sibling follows.

⚠ This reverses a stated permission — that a `subscribeChanges` handler may
start a navigation. Measured, that permission did not deliver what it promised:
the redirect committed, subscribers were told the user was on the new route, and
a tick later the revalidation replaced it with a 404. Two notifications, the
first a lie — the identical phantom-commit shape that is already banned in the
neighbouring pre-start window. The two rules disagreed; this settles it the way
the other one had.

⚠ The refusal is `REENTRANT_NAVIGATION`, thrown synchronously, with the remedy
in the message: `queueMicrotask(() => router.navigate(...))`.

Closes #1759.
