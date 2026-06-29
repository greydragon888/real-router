---
"@real-router/types": minor
---

Add `REENTRANT_TREE_MUTATION` error code

Error code for the reentrant route-CRUD ban (#1032) — thrown when a CRUD op (`add`/`remove`/`update`/`clear`/`replace`) is called synchronously from inside a `subscribeChanges` handler.
