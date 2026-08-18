---
"@real-router/core": minor
---

Fail fast on a prototype-named `queryParams` format, in BOTH directions (#1796)

Follow-up of #1318, which added `requireStrategy` so that a `queryParams` typo
throws a named `TypeError` instead of deferring a cryptic one. Its predicate was
`strategy === undefined`, applied to a lookup the caller had already performed on
a plain object literal — so for the twelve own members of `Object.prototype` the
lookup returned a **member instead of `undefined`**, the guard passed, and that
member was installed as the live strategy. Eleven of the twelve are functions;
`__proto__` yields `Object.prototype` itself, which fails the same way one step
later (the strategy object has no `encode` / `encodeArray`). Two halves, both fixed here.

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
for, still covered — and rethrows anything else. The parser is core's own — `createMatcher` supplies it
and `CreateMatcherOptions` exposes formats, not a custom parser — so no consumer
can inject a thrower.

⚠ A third thrower exists all the same, and an earlier draft of this changeset
denied it: `assignParam` writes `params[name] = value` for every key but
`__proto__`, with the key taken from the URL, so a polluted `Object.prototype`
dispatches into an application setter inside the guarded `try`. Rethrowing it is
correct — an application fault reported as "no such route" is the very confusion
this change removes — and closing the write belongs to #1792.

The guard also owns the KEY, not only the lookup. `Object.hasOwn(table, value)`
and the `table[value]` beneath it each run `ToPropertyKey`, so passing the
caller's value through both read a caller-owned object twice — and a
`{ toString }` answering `"none"` to the guard and `"toString"` to the lookup was
admitted as one strategy and used as another, deferring the very
`opts.strategies.array.encodeArray is not a function` this guard prevents. One
coercion above the check makes verdict and use inseparable.

⚠ One consequence: a **symbol** format now yields the named `TypeError` instead
of `Cannot convert a Symbol value to a string`. The guard always detected it, but
building the message threw from the template, so the named error never reached
the caller for that class.

⚠ **Behaviour change on the parse direction.** A router configured with an invalid
`queryParams` format previously resolved every query URL to `UNKNOWN_ROUTE` with
no diagnostic; `start()` / `matchPath()` now reject with the named `TypeError`.
Only a misconfigured router is affected — a valid format is untouched, and a
malformed percent sequence still unmatches instead of throwing.
