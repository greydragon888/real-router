---
"@real-router/core": patch
---

Keep negative-zero query values as strings under `numberFormat: "auto"` (#898)

`search-params` decoded `"-0"` / `"-0.0"` to the number `-0`, which is not round-trippable: `String(-0) === "0"` and `build(-0)` emits `"0"`, so the leading sign was silently dropped (`?q=-0` → `q: -0` → re-serializes as `"0"`). The `auto` strategy now rejects negative zero (`Object.is(num, -0)`), keeping `"-0"` a string — the same non-round-trippable class already excluded for leading-zero / unsafe-int / exponent (#742). Fixes a seed-dependent flake in the core query-roundtrip property test.
