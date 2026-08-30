---
"@real-router/validation-plugin": patch
---

The state-guard twin captures its deciding intrinsics ([#1971](https://github.com/greydragon888/real-router/issues/1971))

`type-guards/guards/params.ts` is one half of a byte-identical pair with
`shared/browser-env/state-guard.ts` (`scripts/twin-lockstep.test.mjs` compares
`isPlainContainer`, `pushChildren` and `isParamsUnsafe` among others). The
shared half was capturing its intrinsics as part of [#1971](https://github.com/greydragon888/real-router/issues/1971), and a capture on
one side only would leave one twin reading the live global while the other reads
its saved copy — so the same transformation was applied to both from one source.

The three captures are compared by the lockstep registry rather than exempted
from it, which is what makes "identical bodies" mean "identical behaviour".

⚠ **What capture does NOT buy**, stated because the doctrine states it: it
narrows the window from "any time after boot" to "before the module loads". A
shim evaluated ahead of the module still wins ([#1798](https://github.com/greydragon888/real-router/issues/1798)).
This is robustness against polyfills, RUM/APM instrumentation, browser extensions
and test doubles — not a security boundary, since re-pointing `Object.keys`
already requires script execution.

No behaviour change in a healthy environment: an intrinsic nobody touched answers
the same either way.
