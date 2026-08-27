---
"@real-router/core": minor
---

`buildPath` binds a route's encoder once (#1889)

`typeof config.encoders[route] === "function"` and `config.encoders[route](…)`
were two reads of the caller's own argument used as a property key, with a gap
between them. Three consequences, measured on bare core:

- a **drifting** name type-checked one route's encoder and invoked another's —
  reads `C,C,C,A` tested `C` and ran **`A`**;
- a drift landing on a route with **no** encoder threw the raw
  `this[#store].config.encoders[route] is not a function`, leaking a mangled
  private-field expression to the caller;
- a route declaring `encodeParams` cost one coercion more than one without.

A single bind closes all three. The identical idiom in `matchPath`'s
`rewritePathOnMatch` branch is bound too — keyed by `canonical.name`, which a
plugin's `forwardState` interceptor may hand back as a non-string, and where the
same split produced the same raw `TypeError`.

Nothing changes for a string caller, on either site.

⚠ This does **not** stop a caller's `encodeParams` from running before a refusal
that was already guaranteed, and does not close the second divergence — a drift
can still split the encoder read from the matcher read, so `C,C,C,A` runs `C`'s
encoder and builds for `A`. Both are the terminal question tracked in #1883.
