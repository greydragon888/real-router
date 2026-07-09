---
"@real-router/validation-plugin": patch
---

Remove the unreachable retrospective duplicate-name check (#1226)

`validateExistingRoutes` (the retrospective pass run at `usePlugin()` time) carried a duplicate-name detection branch that became dead once bare core rejected duplicate names on every route-population entry point — `createRouter([...])` initial routes (#1351), `add()` (within-batch #953 plus the "already exists" guard for cross-batch collisions), and `replace()` (#968). A built route store can no longer carry a duplicate for the retrospective pass to catch, so the branch was reachable only from white-box unit tests. Removed the branch and its two (identical) tests; core is now the sole authority for the name-uniqueness invariant. No observable behavior change.
