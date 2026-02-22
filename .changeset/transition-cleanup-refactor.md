---
"@real-router/core": patch
---

Eliminate duplicate `nameToIDs()` calls in transition cleanup phase (#138)

Reuse `toDeactivate`/`toActivate` arrays from `getTransitionPath()` result instead of calling `nameToIDs()` again during guard cleanup. 
Removes redundant code and 2 array allocations per navigation.
