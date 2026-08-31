---
"@real-router/angular": patch
---

`<Link hash>` keeps the query it was told was unchanged ([#1925](https://github.com/greydragon888/real-router/issues/1925))

Clicking a `<Link hash="…">` that points at the location you are already on no
longer clears the query string.

The helper asks the router "is this the same location?" and, when the answer is
yes and only the fragment differs, adds `force: true` and `hashChange: true` so
core's `SAME_STATES` check does not reject the transition. It then navigated
with the caller's bare `routeSearch` — `undefined` for a link with no
`routeSearch` prop, which means "no query" rather than "unchanged". From
`/docs?tab=api` such a link landed on `/docs`, and every subscriber was told the
transition was a hash change.

```jsx
// on /docs?tab=api
<Link routeName="docs" hash="install">Install</Link>
// state.path before: /docs         — query gone, announced as a hash change
// state.path now:    /docs?tab=api — the fragment rides in
//                                    state.context.url.hash, as always
```

The query the predicate is asked about and the query the navigation carries are
now one named value, so they cannot drift apart.

Unchanged: a link naming a **different** query is a different location, so the
bypass does not arm and that query is the one that navigates; a link with no
hash makes no claim of sameness and still means the location it names; and an
explicit `routeSearch={{}}` still clears the query.
