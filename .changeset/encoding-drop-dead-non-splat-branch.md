---
"@real-router/core": patch
---

Drop the unreachable non-splat branch of the splat param encoder (#860)

`encodeParam` is now splat-only: `registration/buildParts.ts` routes only SPLAT param
slots through it (a non-splat param is encoded by `ENCODING_METHODS[encoding]` directly),
so its former `!isSpatParam` fast path was unreachable dead code — surfaced when the
path-matcher encoding unit tests were migrated to exercise the public `buildPath` / `match`
surface, and dropped. Behaviour is unchanged (that branch never ran): the encoding /
splat property suites and the build∘match inverse round-trip stay green. `DECODING_METHODS.none`
is likewise never reached through `match` (the matcher special-cases `urlParamsEncoding
=== "none"` to skip decoding entirely), so it is kept only for the map's type completeness
(asserted by the exempt encoding property test) and marked unreachable.
