---
"@real-router/ssr-data-plugin": patch
---

Internal refactor: extract validate-compile-loop + start-interceptor + claim/teardown logic to `shared/ssr/createSsrLoaderPlugin` (#566)

`factory.ts` is now a thin adapter that validates loaders and forwards to the generic `createSsrLoaderPlugin<unknown, Dependencies>`. `validation.ts` is now a thin alias `createLoadersValidator(ERROR_PREFIX)`. Both helpers live in the new `shared/ssr/` directory and are consumed via a git-tracked symlink at `src/shared-ssr` (same pattern as `shared/browser-env/` for browser/hash/navigation-plugin and `shared/dom-utils/` for framework adapters). The companion plugin `@real-router/rsc-server-plugin` consumes the same helpers with `T = ReactNode` and `namespace = "rsc"`.

**Public API unchanged.** All existing tests pass without modification. No runtime behavior change. Bundle output is structurally identical (same logic, same dependencies, +0.02 KB ESM gzipped).
