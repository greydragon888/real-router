---
"@real-router/sources": patch
---

fix(sources): isolate listener exceptions in createActiveNameSelector (#767)

`createActiveNameSelector`'s notification loop had no per-listener exception isolation: a single throwing listener aborted notifications to the remaining listeners of the same route name AND every later name in the iteration, leaving their cached active state stale (a sibling `Link`'s active class frozen until the next related navigation). The loop now wraps each `listener()` in `try/catch` and re-throws asynchronously via `queueMicrotask` — mirroring `BaseSource.notify` (INVARIANTS "BaseSource 3"). One broken Link no longer freezes its siblings.
