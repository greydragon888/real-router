---
"@real-router/core": patch
---

An empty door reads as the bare form rather than `[router.]` (#2487)

`raiser("router", "")` printed `[router.] …` — a head that looks like a door
without naming one, which is the class the raiser exists to remove. An empty door
now behaves as an absent one.
