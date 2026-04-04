---
"@real-router/core": patch
---

Fix `numberFormat: "auto"` lossy roundtrip for leading zeros and unsafe integers

`"00"`, `"007"` now stay as strings instead of being parsed as `0`, `7`. Integers beyond `Number.MAX_SAFE_INTEGER` also stay as strings to prevent precision loss.
