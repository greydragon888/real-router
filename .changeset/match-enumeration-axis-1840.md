---
"@real-router/core": patch
---

fix(core): `match()` walked `Object.prototype` on both of its bags (#1840)

`SegmentMatcher` iterates the params bag with `for…in` to percent-decode it, and
the query bag the same way under `queryParamsMode: "strict"`. Both bags are plain
`{}`, so both walks saw whatever the ambient `Object.prototype` carries — and the
trigger is an **ordinary library extension**, `Object.prototype.foo = 1`, not an
attack. Measured against the released package:

```
Object.prototype.rrNum = 42          (enumerable number)
  matchPath("/u/7") on /u/:id   ->  TypeError: value.includes is not a function

Object.prototype.rrPct = "%E0%41"    (enumerable, bad percent sequence)
  matchPath("/u/7")             ->  undefined      // EVERY dynamic URL, silently

Object.prototype.rrAny = 1           (under queryParamsMode: "strict")
  matchPath("/q?declared=1")    ->  undefined      // EVERY query-bearing URL
```

The first is a hard throw out of `match()`, which
`packages/core/src/engine/CLAUDE.md` says must never happen on input, into callers
that do not catch — `navigation-plugin`'s navigate handler above all, where an
un-intercepted event is widely reported to make Chromium fall back to a
cross-document navigation. ⚠ UNMEASURED here: that sentence has circulated in this
repository since #1796 with the two citations pointing at each other, and it
cannot be measured by this suite, whose navigation tests run against a mocked
Navigation API. Treat it as the reason the handler is written the way it is, not
as a result. The second and third failures need no such caveat: no error, no
diagnostic, every matching URL just stops matching.

Both walks are now `hasOwn`-gated.

⚠ Two things an earlier draft of this text got wrong, both corrected by census
rather than by re-reading:

- _"the idiom the rest of the file already uses"_ — counted: of the file's three
  `for…in` loops exactly **one** carried a gate before this change, and three of
  its four other `hasOwn` calls are lookup-table or read guards that entered the
  day before. One pre-existing loop gate is a precedent, not a convention.
- _"static routes were never affected (they build no params bag)"_ — the
  parenthetical is true and closes the PARAMS walk only. A static route that
  DECLARES a query param does reach the second walk: measured on the released
  build, `/s?tab` under `queryParamsMode: "strict"` matched clean and stopped
  matching with one ambient enumerable. Static routes were affected, on the query
  axis, and this fixes them too.

Nothing changes for an unextended prototype.

The gate calls the module-level capture (`const hasOwn = Object.hasOwn`), not the
global — and a sixth cell pins that distinction, because `chain-walk-authority`
provably cannot: rewriting the gate as an inline `Object.hasOwn(…)` leaves its
census green while measurably weakening the guard. The cell installs a naive
polyfill mid-test, with a control proving the swap took effect.

⚠ **This closes the ENUMERATION axis only, and the two axes need different
environments** — measured, because the distinction decides what is and is not
fixed here:

| on `Object.prototype`         | `for…in` (fixed here) | `target[key] = v` (open) |
| ----------------------------- | --------------------- | ------------------------ |
| plain enumerable data         | **broke**             | fine                     |
| non-writable data             | fine                  | **throws**               |
| getter-only / throwing setter | fine                  | **throws**               |

So the half fixed here is the one an ordinary dependency can trigger; the write
half needs an accessor or a non-writable property. It stays open across core and
the plugins, and **the site count is deliberately not stated here, because no one
has closed it.** #1852 is where that lives, and it has since published three
successive hand-counts and retracted all three — each unreliable in a different
way: short by omission, then conflating write STATEMENTS with write TARGETS. It
now names the shipped `unguarded-computed-key-write` semgrep rule as the
enumerator rather than any figure, and records two holes in the rule itself: it
excludes `map[name]`-shaped writes by design, which is where the highest-severity
member of the class lives (#1855), and its `--include '**/src/**'` filter cannot
see `shared/` (#1838). A raw candidate count depends entirely on the predicate
used, which is why one is not quoted here.

Closing it costs either `Object.defineProperty` — measured at 6-9× plain
assignment **on `normalizeChannel`'s loop**, which is the one that was actually
benchmarked; the same ratio has NOT been measured on the matcher's own loops — or
a breaking change to the channel bags' prototype. Tracked as its own
issue, with the inventory and the measurements.

⚠ **And it is not a per-site fix.** A single `matchPath` on a one-param route
crosses at least TWO live sites of that axis: neutralising the one in the matcher
leaves the throw in place, moved downstream to the channel normaliser on the same
arc. Measured. So a benchmark that patches one loop reports a fraction of the
real cost — which the linked issue now says as well. Two BOUNDARY cells in
`match-never-throws-on-input-1840.test.ts` pin how much of the contract is
currently unmet; they assert that the AXIS is open and deliberately do not name a
site, because they provably cannot tell the two apart.

⚠ **Both sites were listed as EXEMPT in `chain-walk-authority`**, on the reason
"core's OWN bags … nothing the caller can reach through their prototype". Both
halves of that are true and neither is the hazard — the bags are core's, the
caller's prototype is irrelevant, and the walk sees the AMBIENT one. The rows are
gone rather than re-labelled, since `guardsOwn` no longer classifies a gated loop;
the refuted reason is recorded in their place.
