---
"@real-router/solid": minor
---

Ship the `use:link` directive's `JSX.Directives` augmentation in the published types (#976)

The `JSX.Directives.link` augmentation previously lived in a standalone `directives.d.ts` that `tsc` never re-emitted, so it never reached `dist/`. Consumers got no type-checking for `use:link` and the runtime-broken accessor form `use:link={() => options}` slipped through `tsc`. The augmentation now lives in `src/directives/link.tsx` (inside the entry's import graph), so `rollup-plugin-dts` bundles it into the published declarations.

- `use:link` is now type-checked for consumers as `LinkDirectiveOptions | undefined`. The canonical **object** form `use:link={{ routeName }}` is accepted; the **accessor** form `use:link={() => ({ routeName })}` is rejected with TS2322 — it double-wraps into `() => (() => options)`, so the directive receives a function and builds no `href`/navigation. This matches the package's own tests and removes the example-vs-package type inconsistency.
- Migration: replace any `use:link={() => (options)}` with `use:link={options}`.
