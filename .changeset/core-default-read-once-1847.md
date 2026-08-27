---
"@real-router/core": minor
---

Resolve a route's own defaults once per call (#1847)

A route's `defaultParams` / `defaultSearch` is held by reference and read on
every navigation — that aliasing is deliberate and documented. What was not
deliberate is that the router read it **2 to 4 times per door**, so an
accessor-backed default could answer those reads differently and two of them
would disagree.

Two faces followed, and neither lives inside a single pass:

- **the committed state contradicted its own path** — one read built
  `state.search`, a later one printed `state.path`, so a default that turned
  defined in between printed a key the state does not carry;
- **`buildPath` disagreed with `navigate`** on one intent, breaking the
  documented "href equals destination" invariant (#1578): a `<Link>` rendered
  `/u/7` and the click landed on `/u/7?tab=GHOST`.

Every door now reads it exactly **once** — `buildPath`, `isActiveRoute`,
`canNavigateTo`, `matchPath`, `makeState`, `buildNavigationState` and `navigate`
alike — because the merge moved above the ⑤a executor, which the pipeline's port
already documented as taking "already-merged channels", and because the
withholding pass stopped handing the route's own object back by reference.

**Why `minor`.** A default that answered differently within one navigation now
cannot. Nothing changes for a stable one, and there is no API change — but the
observable behaviour of an accessor-backed default does.

⚠ A `buildPath` interceptor now receives the canonical channels rather than the
caller's raw bags, which is what the navigate path has always handed it. A plugin
that relied on seeing the raw params bag as its query source must read `search`.
`@real-router/persistent-params-plugin` is the one such plugin in this repo and
is updated in the same release.
