---
"@real-router/rsc-server-plugin": patch
---

The `shared/ssr` sources this package bundles are now linted (#1913)

No behaviour change, and no change to this package's own `lint` script.

`shared/ssr/` is symlinked into both SSR plugins and was invisible to every lint
run: `eslint`'s globs do not descend into a symlinked directory while walking a
parent. It is now linted exactly once, by `@real-router/ssr-data-plugin` — the
package that already owns the directory for coverage — so the same nine files are
not reported two, three or five times over. A repo gate
(`scripts/check-coverage-scope.mjs`) derives that owner from the filesystem and
fails if its lint script stops passing the alias.

What that surfaced and fixed in code this package ships: 49 problems (41 errors +
8 warnings), of which four were conditions TypeScript believes can never fire.
All four are deliberate runtime guards where the type does not bind the caller,
and each now carries that reason instead of being deleted. The rest were short
identifiers, brace style, redundant assertions, and one validator split into two
functions — verified message-for-message against the previous implementation.

⚑ `Promise.withResolvers` is deliberately NOT adopted in the client-side defer
registry, which this package also bundles: it is ES2024 (Chrome 119, Firefox 121,
Safari 17.4), so taking it would drop every Safari below 17.4. That is a decision
about supported runtimes, not a lint fix.
