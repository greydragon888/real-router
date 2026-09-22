---
"@real-router/core": patch
---

The refusals that carry their message in a `RouterError` bag build through the raiser (#2487)

One observable change: a `subscribeChanges` call on a disposed router said
`[router.treeChanged.subscribe]`, which names the internal channel the method
delegates to rather than the call anyone made. It now says
`[router.subscribeChanges]`. The wrong door was there before the refactor — the door
authority could not see a door spelled inside an options bag, and the conversion is
what made it visible.
