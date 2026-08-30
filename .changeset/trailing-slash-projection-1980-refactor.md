---
"@real-router/core": patch
---

The `trailingSlash` narrowing has one home again (#1980)

The router takes three `trailingSlash` values and the matcher takes two, so the
narrowing has to happen somewhere. It happened in two places, written out
identically: once inside `matchPath`'s rewrite arm and once in the cached
`#getBuildPathOptions` that `buildPath` already uses. Two homes for one rule is
the drift trap #1550 / #1551 closed elsewhere by collapsing merge sites.

`matchPath` now goes through the same builder. Behaviour is unchanged, and the
arc allocates no options bag at all — the builder caches per router. `preserve`,
the third value, is still read from the raw option in `matchPath`, because the
matcher never sees it and it is that arc's own business.

Internal only: `createMatcher` and its options are not on the package's exports
map; consumers write the enum.
