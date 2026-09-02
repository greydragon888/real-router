---
"@real-router/core": patch
---

Four doors read a caller-owned slot once ([#2085](https://github.com/greydragon888/real-router/issues/2085))

Each of them asked a slot to decide something and asked again to use it, and the
second answer is the one that shipped.

- `navigateToState` read `state.name` four times. The existence check, the P3
  channel registry and the copy that COMMITS each asked separately, so a slot
  answering differently committed a state whose route was never checked to exist,
  carrying another route's `path` and `params`. The name is now read once, above
  all three.
- `areStatesEqual` read `state1.name` to compare the two names and again to pick
  which slots to compare them ON. Two states of one route with different params
  were reported EQUAL, because the second answer selected another route's slot
  set — which neither state carries, leaving nothing to differ on.
- `wrapSyncError` tested `thrown.cause` and re-read it for the payload, so the
  `cause` attached to a `RouterError` need not be the one that passed the test.
- `areParamValuesEqual` read `val1.length` for the equality test and again as the
  loop bound. `Array.isArray` answers true through a Proxy — a reactive array is
  exactly that shape — so a drifting length skipped the element walk and answered
  `true`.
