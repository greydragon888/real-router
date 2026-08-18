---
"@real-router/core": minor
---

Fail fast on a prototype-named `queryParams` format, in BOTH directions (#1796)

Follow-up of #1318, which added `requireStrategy` so that a `queryParams` typo
throws a named `TypeError` instead of deferring a cryptic one. Its predicate was
`strategy === undefined`, applied to a lookup the caller had already performed on
a plain object literal — so for the twelve own members of `Object.prototype` the
lookup returned a **function**, the guard passed, and a native method was
installed as the live strategy. Two halves, both fixed here.

**The lookup now belongs to the guard.** `requireStrategy` takes the table and
the key and asks `Object.hasOwn`, because a predicate handed the RESULT of
someone else's read cannot tell "absent" from "inherited". Before this, measured
per format with a value of its own type: `arrayFormat` / `booleanFormat` /
`nullFormat` set to `"toString"` degenerated into exactly the deferred
`TypeError: opts.strategies.X.Y is not a function` that #1318 exists to prevent,
while `numberFormat` was worse — it was ACCEPTED, built `/x?a=7`, and its own
`matchPath` then failed to reproduce it.

**A config error is no longer mistaken for malformed input.** The `#737` catch-all
around the query parser in `SegmentMatcher` swallowed everything, so the named
error only ever reached the BUILD direction — and #1318's own reported symptom
(*"Every URL with a query resolves to UNKNOWN_ROUTE; the symptom points at
routes/URLs, not the config"*) survived its fix on the match path. The catch now
returns `undefined` for a `URIError` — the percent-decoding class it was written
for, still covered — and rethrows anything else. Narrowing is safe because the
parser is core's own: `createMatcher` supplies it and `CreateMatcherOptions`
exposes formats, not a custom parser, so the only throwers reachable there are
`decodeURIComponent` and `requireStrategy`.

⚠ **Behaviour change on the parse direction.** A router configured with an invalid
`queryParams` format previously resolved every query URL to `UNKNOWN_ROUTE` with
no diagnostic; `start()` / `matchPath()` now reject with the named `TypeError`.
Only a misconfigured router is affected — a valid format is untouched, and a
malformed percent sequence still unmatches instead of throwing.
