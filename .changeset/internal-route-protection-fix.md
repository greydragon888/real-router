---
"@real-router/core": patch
---

Block public API mutations on internal `@@`-prefixed routes (#238)

Routes with the `@@` prefix (e.g. `@@router/UNKNOWN_ROUTE`) are reserved for internal use. Previously, `validateRouteName` bypassed all validation for `@@` names, allowing users to add, remove, update, or replace system routes through the public API.

Added `throwIfInternalRoute` and `throwIfInternalRouteInArray` validators that throw when CRUD operations target `@@`-prefixed routes. Read operations and guard registration remain allowed. `noValidate: true` bypasses the check for internal callers.
