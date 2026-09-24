---
"@real-router/svelte": patch
---

Lint the package's `.svelte` and `.svelte.ts` sources (#2407)

The package's ESLint config ignored every component file, so ESLint had never read them. They are linted now, and the findings are fixed without a change in behavior. Among them:

- import order and spacing;
- braces on one-line `if` statements;
- catch parameters named `error`;
- `= undefined` defaults dropped from `$props()`;
- the `Link` and `RouteView` prop types declare their index signature first.

In the published components, the checks that guard input outside a declared type stay, each marked with its reason: `Lazy`'s check of the resolved module, and `RouterErrorBoundary`'s optional call of `children`.
