---
"@real-router/core": patch
---

Align the gate's optional-before-splat reject reason with the registerTree backstop (#1287)

`validateRoutePath` now checks `hasMultipleOptionalsBeforeSplat` (#1287) BEFORE
`hasUnconstrainedOptionalBeforeSplat` (#1264), matching the order the path-matcher
`registerTree` backstop uses (`registerNode` runs the #1287 predicate before
`markOptionalFork`'s #1264 throw). A path that triggers both — `/:a?/:b?/*rest` (two
optionals, the inner one unconstrained before the splat) — previously reported the
#1264 reason from the gate but the #1287 reason from the backstop: the same
accept/reject verdict (both reject) but a different, misleading message. The #1264
hint ("add a constraint") is a dead end for this shape — `/:a<c>?/:b<c>?/*rest` is
still rejected by #1287 — so the gate now reports #1287's actionable "split into two
routes, or drop the '?' on one". Accept/reject is unchanged; only the reject message
on this already-rejected malformed family moves.
