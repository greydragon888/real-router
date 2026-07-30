---
"@real-router/core": patch
---

Validate a route decoder's output again on the `matchPath` path (#1582)

`matchPath` builds a state out of whatever a route's `decodeParams` returns, and
that return value is USER code — external input, not a router-produced
intermediate. The check on it went missing when the entry point moved onto the
nav pipeline (#1548, step 2-2): it lived inside a `forwardState` dependency
wrapper the migration deleted, and its removal was justified as dropping a check
on "the bags `matchPath` had just produced itself (matcher output + decoder
output)". That reading is right about the matcher and wrong about the decoder.

Bare core is unaffected — it was, and remains, tolerant here (measured
byte-for-byte across seven return shapes). What came back is the opt-in
diagnostic: with `@real-router/validation-plugin` installed, six shapes that had
started committing silently throw an actionable `TypeError` again.

```ts
// decodeParams returning …          bare core (unchanged)   with the plugin
["a"]; // params { "0": "a" }     TypeError
("oops"); // params { "0": "o", … }  TypeError
new Map([["a", "1"]]); // params {}               TypeError
new Custom(); // params { a: "1" }       TypeError
Object.create({ inherited: "x" }); // params {}               TypeError
```

Two things are better than before the regression, not merely restored:

- The message names **`matchPath`**. The pre-pipeline call reported
  `[router.forwardState] Invalid routeParams` for a fault raised on the
  `matchPath` path, because that is the wrapper it happened to sit in.
- It runs **only when a decoder actually ran**. The matcher's own output on the
  same line is router-produced and plain by construction, so validating it was
  the internal-intermediate check the migration was right to drop.

`RoutesDependencies` gains `getValidator` — the same per-call closure EventBus,
RouteLifecycle and Plugins already receive, so the validator stays resolved at
call time (absent before registration, absent again after teardown).
