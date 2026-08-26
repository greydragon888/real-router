---
"@real-router/ssr-data-plugin": patch
---

The lint gate now looks at `shared/ssr`, and the 49 findings behind it are resolved (#1913)

No behaviour change. `eslint`'s globs do not descend into a symlinked directory
while walking a parent, so `eslint src/` linted this package's own files and none
of the shared ones it ships. Measured: 8 files and 0 problems before, 9 files and
49 problems (41 errors + 8 warnings) when the alias is passed explicitly. The
script runs `--max-warnings 0`, so all 49 were gate failures.

The substance was four `no-unnecessary-condition` — conditions TypeScript believes
can never fire. All four turned out to be the second kind: deliberate runtime
guards where the type does not bind the caller. `defer()` is a public export, so
its parameter type constrains TypeScript callers and nobody else; the hydration
guard stands in front of a value whose type comes from a cast (#762). Each now
carries the reason rather than being deleted or silenced blindly.

Of the remaining 45, `--fix` resolved 24 and 17 errors plus 4 warnings needed a
hand — eight short identifiers, a nullish-coalescing rewrite, a `Set` in place of
three repeated comparisons, and one validator split into two functions to get its
cognitive complexity from 27 under the limit of 15. Same checks, same order, same
messages: verified against the previous implementation on a 16-case matrix,
16/16 identical.

⚑ One finding is deliberately NOT taken: `Promise.withResolvers` would simplify
the client-side defer registry, but it is ES2024 and that module ships to the
browser — Chrome 119, Firefox 121, Safari 17.4, so it would drop every Safari
below 17.4. Raising the supported-runtime floor is a product decision, not a lint
fix, so the rule is disabled at that one site with the reason written down.
