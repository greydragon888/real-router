---
"@real-router/core": patch
---

The `trailingSlash` narrowing has one home again (#1980)

The router takes four `trailingSlash` values and the matcher's per-call options
take two, so the narrowing has to happen somewhere. It happened in two places,
written out identically: once inside `matchPath`'s rewrite arm and once in the
cached `#getBuildPathOptions` that `buildPath` already uses. Two homes for one
rule is the drift trap #1550 / #1551 closed elsewhere by collapsing merge sites.

The rule now lives in one `narrowTrailingSlash`, and each site builds its own
bag. Sharing the CACHE was tried and reverted: `#getBuildPathOptions` keeps its
first input for the life of the router, and `matchPath`'s options come from the
caller of the published `getInternals().matchPath`, so one doctored bag could
rewrite every later `buildPath`. `preserve` is still read from the raw option in
`matchPath`, because the matcher never sees it.

Internal only: `createMatcher` and its options are not on the package's exports
map; consumers write the enum.

⚠ This does not touch the OTHER projection of the same two options — the
booleans `strictTrailingSlash` / `strictQueryParams` that `Router.ts` builds for
`createMatcher`. That is a different rule for a different consumer and it has
one home.
