---
"@real-router/core": patch
---

Cache getTransitionPath result by state reference (#145)

Add single-entry reference cache to `getTransitionPath()` eliminating redundant computations when multiple `shouldUpdateNode` predicates are called with the same state pair during a single navigation.
