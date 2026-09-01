---
"@real-router/core": minor
---

Publish `freezeThrownError` on `@real-router/core/utils` (#1964)

`#1960` froze every `RouterError` core throws. Three doors OUTSIDE core construct
one and hand it to consumer code, so the rule needed an implementation a plugin
can call rather than a fourth copy of `Object.freeze` with the reason beside it.

It joins `putField` / `copyFields` on the same subpath and for the same stated
reason — core’s own discipline, published once because a plugin has to obey it
too. The subpath now names its two rules (ingestion, hand-out) instead of one.
