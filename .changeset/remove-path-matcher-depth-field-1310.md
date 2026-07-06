---
"@real-router/core": patch
---

Remove the write-only `depth` field from path-matcher's `CompiledRoute` (#1310). It was assigned at registration but never read on any production path — only a unit test pinned the dead value. Internal cleanup, no behaviour change.
