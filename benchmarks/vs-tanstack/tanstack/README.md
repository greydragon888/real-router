# TanStack Router Client-Nav Benchmark

Copied from [TanStack/router](https://github.com/TanStack/router) for side-by-side comparison.

- **Source commit:** [`5a81726`](https://github.com/TanStack/router/commit/5a81726f0a2f819fae0763896cef784aa10ddc9f)
- **Source directory:** [`benchmarks/client-nav/`](https://github.com/TanStack/router/tree/5a81726f0a2f819fae0763896cef784aa10ddc9f/benchmarks/client-nav)
- **License:** MIT (https://github.com/TanStack/router/blob/main/LICENSE)
- **Scope:** React only (Solid/Vue omitted)

## Changes from original

1. `workspace:^` dependencies replaced with npm package versions
2. Solid/Vue frameworks removed (React only)
3. `@codspeed/vitest-plugin` removed (not used in our CI)
4. Shared `jsdom.ts` and `setup-helpers.ts` reused from parent `vs-tanstack/`
5. Vite config adapted for our directory structure
