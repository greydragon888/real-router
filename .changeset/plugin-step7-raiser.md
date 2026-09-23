---
"@real-router/validation-plugin": patch
---

Every refusal builds through the raiser (#2487)

Step 7, the largest family: 108 sites in 12 files write their message head once as a
binding instead of spelling it at each construction. No text moves in the 105 that
already had a head — measured against `origin/master`, body by body with the head
stripped, not assumed.

Three observable changes, all of them a head this package already owed:

- `collectPathsToRoute`'s not-found throw said `[internal]`. No caller input reaches
  it, which is the shape O-1 gives a marker, so it now reads
  `Internal error (please report): …`. The `UNREACHABLE_BY_CONSTRUCTION` register
  held that one entry and retires with it.
- refusing an install after `start()` and refusing a second install both carried NO
  head, and both opened by naming the plugin in prose. The name moves into the head
  where every other message in this package carries it:
  `[validation-plugin] must be registered before router.start()` and
  `[validation-plugin] is already installed on this router — …`.
