---
"@real-router/core": patch
---

perf: the path channel is frozen where it is published, not where it is merged (#1598)

`canonicalize`'s fast path froze the params bag on every call — including the
calls that never publish it. `buildPath` returns a string, `isActiveRoute` returns
a boolean, and both discarded the frozen bag on the next line, so the freeze was
paid by every `<Link>` render for a guarantee only a committed state needs.

The freeze moves to `materialize`, the one place a `Canonical` becomes something
user code can hold — before its `skipFreeze` branch, which defers the state SHELL
and never the channels, so guards on the navigate path still see immutable bags.

`params` only. `canonical.query` is already frozen on every path (the
`EMPTY_SEARCH` singleton on the fast one, `admittedSearch`'s own result on the
slow one), and re-freezing a frozen object is not free — freezing both regressed
`isActiveRoute-exact` by 9.8 % where freezing one wins.

Measured against pre-pipeline `0fed89b`, medians of 9 alternating single-module
processes, A/A floor ≤ 1 %: `buildPath` −14.6 % params / −9.3 % static / −7.9 % on
a `?`-declaring route, `canNavigateTo` −6.9 % (now **0.99×** of pre-pipeline — that
predicate's pipeline cost is fully paid back), `isActiveRoute-parent` −6.8 %.
`isActiveRoute-exact` is flat by construction: it publishes a state, so it pays the
same freeze one line later.

The `Canonical`-level contract narrows accordingly and is restated in
`INVARIANTS.md`: channels are frozen by PUBLICATION rather than by merge. That is
safe because a `Canonical` has exactly two consumers — `buildURL`, which reads, and
`materialize`, which publishes — and the brand is unexported, so there can be no
third.
