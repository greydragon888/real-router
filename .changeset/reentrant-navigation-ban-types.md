---
"@real-router/types": minor
---

Add `REENTRANT_NAVIGATION` error code (#1030)

New member on `ErrorCodeKeys` and `ErrorCodeToValueMap` for the banned synchronous reentrant navigation guard. The runtime value ships in `@real-router/core`'s `errorCodes`; see its changelog for behavior and migration.
