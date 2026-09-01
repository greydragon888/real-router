---
"@real-router/navigation-plugin": minor
---

A `RouterError` this package throws is frozen (#1964)

Aligns with core, where every thrown `RouterError` has been frozen since #1960.
Measured on the `onTransitionError` channel: ONE instance is handed to every
plugin hook of a dispatch, so an in-place write by one rewrites what the next one
reads — and a consumer catching an error could not tell which package produced
the shape it got.

**Behaviour change:** annotating a caught `RouterError` from this package (`err.appCode = 1`)
now throws, as it already does for core’s. Swept across the repository before shipping —
no test or source annotates one.
