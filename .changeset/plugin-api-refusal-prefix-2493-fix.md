---
"@real-router/core": patch
---

Two `PluginApi` refusals now name the door they came from (#2493)

`getPluginApi().extendRouter()` and `.claimContextNamespace()` each refused a
conflict with a message that carried no prefix at all, so a caller could not tell
which call had failed. Both now open with the door, matching the prefixed refusal
the same `claimContextNamespace` already raised for a non-string namespace:

```diff
- Cannot extend router: property "navigate" already exists
+ [router.extendRouter] Cannot extend router: property "navigate" already exists

- Cannot claim context namespace: "x" is already claimed by another plugin
+ [router.claimContextNamespace] Cannot claim context namespace: "x" is already claimed by another plugin
```

⚑ They survived #2456 and #2459 — the sweeps that adjudicated core's unprefixed
refusals to none — because `message-prefix-authority-1845` never read a message
written in a `RouterError` options bag, nor an error built anywhere other than a
`throw`. The authority now judges the CONSTRUCTION rather than the throw, which
is what surfaced these two; the same walk covers refusals delivered by
`Promise.reject` and by a helper whose caller throws.
