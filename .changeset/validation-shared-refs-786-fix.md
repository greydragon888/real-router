---
"@real-router/validation-plugin": patch
---

Accept shared references / diamonds in params validation (#786)

`isParams` no longer rejects fully serializable params that reuse the same object or array under multiple keys (a diamond / DAG, not a cycle). Navigating or building a state with a shared default object — e.g. `navigate("route", { a: shared, b: shared })` — no longer fails validation with a false `Invalid params`. Genuine circular references are still rejected.
