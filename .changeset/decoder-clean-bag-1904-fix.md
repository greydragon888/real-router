---
"@real-router/core": patch
---

A route's `decodeParams` receives bags core has already cleaned (#1904)

`matchPath` builds the query bag itself, by parsing the URL, and the parser
creates an own `"__proto__"` key deliberately (#855 / #1293) — writing it any
other way would swap the parsed object's own prototype. The drop then happened
only at the channel entry, which sits BELOW the two seams that hand that bag to
application code: a route's `decodeParams`, and every `forwardState`
interceptor on the URL direction. So core handed out a container it will not
publish.

Measured on `matchPath("/p?a=1&__proto__=2")` with `queryParamsMode: "loose"`,
per seam and per invocation: `decodeParams` and the interceptor (in AND out)
each received own keys `["a", "__proto__"]`, while the committed `state.search`
had `["a"]`.

The asymmetry is what made this a defect rather than a contract: the sibling
codec on the same route config, `encodeParams`, never saw the key on any
direction, and nothing explained the difference.

Nothing observable changes for a well-behaved consumer — the committed state,
the href and the round-trip are all unaffected, and they were correct before.
What changes is the hazard handed to a decoder that MERGES what it was given:
`Object.assign` (or a `for…in` copy) reaches the inherited setter, so
`?__proto__` (which parses to `null`) or `?__proto__=1&__proto__=2` (an array)
replaced the prototype of that decoder's own object, silently. A spread or
`Object.fromEntries` was always safe, because both DEFINE.

⚑ **Both channels, not just the query one.** A route may declare a path SLOT
named `__proto__` (`/q/:__proto__` — registration accepts it, and `/q/zzz`
matches), and measured there the decoder received `params` with own keys
`["__proto__"]` while the committed state had `[]` — the same one-parse-two-
answers split, on the other channel.

The drop is at the door, not at the construction: the parser's write stays as
it is. It returns each bag untouched with no allocation when the key is absent,
so an ordinary URL pays two `Object.hasOwn`.

⚠ The guard asserts what a seam RECEIVES, never what gets committed — a trial
of this fix broke 0 of 4584 tests, because every commit-shaped assertion is
green on both sides. `encodeParams` is the control: already clean, and pinned
so the asymmetry closes rather than inverts. The path-channel cells exist
because the first revision of this fix cleaned the query bag ALONE and the
guard was green on it.

Part of #1901.
