---
"@real-router/core": patch
---

`PluginApi.makeState` stops repeating the guards its adapter runs (#2259)

When the guards moved onto the `RouterInternals` adapters, `makeState` kept its
copy on the facade as well. The door therefore adopted the caller's bag and
validated it, then handed the copy to an adapter that did both again.

Not a correctness defect — the second adopt reads core's own copy, so the
caller's bag is still read exactly once and `read-count-authority`'s invariant
held throughout. What it cost is two copies of one rule and two allocations per
call, on a door plugins use.

Found by mutation-testing the changed regions rather than by reading them.
