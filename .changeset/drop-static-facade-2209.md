---
"@real-router/route-utils": minor
---

`RouteUtils` no longer carries the static segment-tester facade (#2209)

`RouteUtils.startsWithSegment`, `.endsWithSegment`, `.includesSegment` and
`.areRoutesRelated` are removed. The four functions remain exported from the
package root, which is where they were always the surface — import them
directly:

```diff
- import { RouteUtils } from "@real-router/route-utils";
- RouteUtils.startsWithSegment("users.list", "users");
+ import { startsWithSegment } from "@real-router/route-utils";
+ startsWithSegment("users.list", "users");
```

⚠ **The facade was documented as keeping the functions tree-shakeable, and
measurement refuted that.** A static field is a reference, so importing
`RouteUtils` retained all four testers — and every adapter's `useRouteUtils`
imports it. Measured with esbuild against the built output, one app per entry:
the `getRouteUtils` path was **1 945 B** and is now **1 771 B**; the package's
own `dist/esm/index.mjs` goes 2 100 → 2 003 B.

⚠ **Removing only the two unused testers' fields would have recovered 50 B and
shed neither of them**, because the remaining two fields kept the family alive.
A getter is not an escape either — measured, it retains the function just the
same and costs more bytes than a field. The API and the shakeability are in
direct conflict, so the whole facade goes.

The rest of the gap is #2210's mechanism, not this one's: `endsWithSegment` and
`includesSegment` are module-level `const`s initialised by a CALL, which no
bundler may drop without `/*#__PURE__*/`, and rolldown strips that annotation
under `minify: true`. With it the same path measures **749 B**. That half is
blocked upstream and is recorded there.

`segmentTesters.test.ts` turns its facade cells over rather than deleting them,
so the static form cannot come back without a red.
