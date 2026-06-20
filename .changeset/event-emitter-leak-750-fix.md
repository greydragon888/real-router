---
"@real-router/core": patch
---

Fix heap leak in the internal event emitter for dynamic event names (#750)

The internal event emitter (bundled into core) retained a per-event-name record after the last listener was removed: `off()` deleted the listener from its `Set` but never released the now-empty `Set`, and the depth-tracking `emit()` path left a `{name → 0}` entry behind. The only release point was `clearAll()`, so a consumer with **dynamic event names** accumulated one record per name unbounded — `listenerCount()` returned 0, masking the growth.

`off()` now releases the record (and its warn latch) once the last listener is gone, and the depth-tracking `emit()` path deletes its entry when recursion unwinds to zero. The router uses a fixed set of event names, so it was only latently affected; the primitive is now leak-free for any naming pattern. Adds heap-stress coverage (healthy ~0.03 MB vs pre-fix ~40 MB).
