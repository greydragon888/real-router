---
"@real-router/hash-plugin": patch
---

An entry `router.replaceHistoryState()` writes keeps its state where the host stores `history.state` by reference, as jsdom does (#2741)

`router.replaceHistoryState()` reuses one object for the states it writes. A browser stores a structured clone of each write, so the reuse never showed there. jsdom keeps the object itself, so the entry it wrote read back the state of the next `replaceHistoryState()` call: after a Back to it, `history.state` named the wrong route.

The plugin now writes a copy of each state and stamps the entry's position on the copy. A browser behaves as before.
