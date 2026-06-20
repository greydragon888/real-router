---
"@real-router/core": patch
---

Fix spurious and duplicate listener-limit warnings (#752)

The internal event emitter (bundled into core) violated the documented "exactly once" contract for its listener-limit warning. Two cases are fixed:

- **No warning for a failed registration** — the hard `maxListeners` limit is now checked **before** the warning, so a registration that throws `"Listener limit"` (e.g. when `limits.warnListeners === limits.maxListeners`) no longer emits the "possible memory leak" warning.
- **Warn exactly once per event** — the warning is latched per emitter+event, so off/on listener churn around the threshold no longer re-fires it. `clearAll()` resets the latch.
