---
"@real-router/core": patch
---

Fix a try-take-if-valid fork dead-ending on the last segment (#1283)

The A1 (#1264) / required-param (#1266) try-take-if-valid fork skipped to the splat sibling only when the constraint FAILED. A constraint-SATISFYING segment that is also the LAST one, whose take-node is a dead terminal (no route, only a would-be-empty splat child), committed into a dead end — `match("/v1")` returned `undefined` for `/:v<v\d+>?/*rest` (and for `/*rest` + `/:v<v\d+>/*rest`) while `buildPath` emitted `/v1`, a dead deep-link (the exact `range(buildPath) ⊄ dom(match)` class the fork was built to close). `match` now also skips to the splat when the take would dead-end on the last segment; a take-node with a terminal route still takes (present-first preserved).
