---
"@real-router/core": minor
---

Fix `numberFormat: "auto"` type asymmetry for negative numbers (#742)

Under the default `numberFormat: "auto"`, negative numeric query params parsed from
a URL stayed strings (`/x?n=-5` → `"-5"`) while the same value passed programmatically
via `navigate("x", { n: -5 })` was stored as a number. The two code paths now agree:
canonical negatives decode to `Number`, so a param keeps the same type regardless of
how it arrives.

- `parse("n=-5", { numberFormat: "auto" })` → `{ n: -5 }` (was `{ n: "-5" }`)
- `build({ n: -5 })` → `"n=-5"` now round-trips back to the number `-5`
- Non-canonical negatives (leading-zero `"-007"`, unsafe-int `"-9007199254740992"`)
  and exponent notation still stay strings, preserving their exact text

Breaking for code that relied on negative URL params staying strings under `auto`.
