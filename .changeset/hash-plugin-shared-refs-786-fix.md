---
"@real-router/hash-plugin": patch
---

`isState` accepts params with shared references / diamonds (#786)

The re-exported `isState` guard (bundled `type-guards`) rejected fully serializable params that reuse the same object or array under multiple keys (a diamond / DAG, not a cycle), reachable from a `history.state` carrying shared references. The guard now accepts them; genuine circular references are still rejected.
