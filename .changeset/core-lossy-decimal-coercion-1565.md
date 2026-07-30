---
"@real-router/core": minor
---

Keep query decimals that `String()` cannot reproduce as strings (#1565)

`numberFormat: "auto"` states round-trip stability as its acceptance criterion —
a value is coerced only if the router can print it back unchanged — but enforced
that criterion with two hand-written special cases (`-0` and unsafe integers)
instead of measuring it. Decimals slipped through both, so `matchPath` rebuilt a
URL different from the one it had just matched:

```ts
const router = createRouter([{ name: "t", path: "/t?page" }]);

getPluginApi(router).matchPath("/t?page=2.0");
// before: search { page: 2 },     path "/t?page=2"     ← the user's URL was rewritten
// now:    search { page: "2.0" }, path "/t?page=2.0"
```

The criterion is now enforced directly — `String(Number(value)) === value` — which
subsumes the old negative-zero guard and closes the whole family it left open:
trailing zeros (`2.0`, `2.10`, `0.50`, `100.00`, `0.0`, `-2.0`) and precision loss
(`1.0000000000000000001`, `9007199254740993.5`, `12345678901234567890.5`). Under a
URL plugin the rewritten string reached the address bar, so this was visible, not
just structural.

**Behaviour change:** such a value now arrives as its exact text instead of a
number. `?page=2.5` and `?page=42` are unaffected — they print back identically
and are still coerced. Reading a lossy decimal as a number is a deliberate opt-in:
use `@real-router/search-schema-plugin` with `z.coerce.number()`, or convert at
the call site.

Values that already stayed strings are unchanged: leading zeros (`007`), exponent
notation (`1e5`), `-0`, and unsafe **integer** magnitudes (`9007199254740992` —
these round-trip textually but lose arithmetic precision, so the safe-integer
guard stays on top of the new predicate).

Locked by engine INVARIANT #16, generated through `arbNonCanonicalNumericString`,
so every property that consumes it now covers the family too.
