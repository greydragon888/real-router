---
"@real-router/core": patch
---

`isActiveRoute` asks about the location under `ignoreQueryParams: false` ([#1978](https://github.com/greydragon888/real-router/issues/1978))

`ignoreQueryParams: false` now adds the query channel and **nothing else**: the
path comparison is the same one the default `true` performs, never a wider one.

The exact-match arm used to delegate the whole question to
`areStatesEqual(..., false)`, which answers a different one — state IDENTITY,
over the whole `params` bag. A key the route declares in neither channel rides
there as app-level data and never reaches `state.path`, so it is not part of the
location, and letting it decide made the predicate contradict itself: on one
committed state carrying one such key, a link to the **ancestor** reported
active while a link to the route the user was **on** reported inactive.

The user-visible half is `<Link hash="…">`. Its same-route bypass is gated on
exactly this call with exactly this polarity, so on any route whose state
carried such a key the bypass never armed, the navigation behind it was rejected
as `SAME_STATES`, and the fragment link was dead — the same shape as
[#1925](https://github.com/greydragon888/real-router/issues/1925), reached
through a different argument of the same call.

```js
await router.navigate("u", { id: "7", tab: "settings" }); // `tab` declared nowhere
router.getState().path; // "/u/7"

router.isActiveRoute("u", { id: "7" }, undefined, true, false);
// before: false — for the URL the user is already on
// now:    true
```

The same now holds for such a key in the LINK's own bag, and on the hierarchical
(ancestor-link) branch too: both branches compare over the keys the COMMITTED
STATE carries, so one rule answers for both.

Two keys that look like it and are not:

- a name a route's `defaultParams` mentions reaches no URL, but the state
  carries it — so it decides. ⚠ That now holds on the exact-name branch and
  under the DEFAULT polarity too, where it previously did not: the two branches
  disagreed about such a key, and this is the side that moved;
- a name the route declares with `?` but the caller passed in `params` (the
  retired single-bag form) prints nothing of its own, yet it withholds a
  `defaultSearch` for that slot — where it does, the href really loses
  `?name=value`, the location differs, and the answer stays `false`. Refusing
  the spelling itself remains the always-on channel guard's job, on the
  committing producers.

`areStatesEqual` itself is unchanged. Its `false` polarity still compares the
whole `params` bag, which is what makes it the right tool for comparing two
states rather than asking where the user is.
