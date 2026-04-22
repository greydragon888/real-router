---
"@real-router/browser-plugin": patch
---

Hot-path and code-quality cleanup from audit (#470)

Audit follow-up — Priority 4 items from `packages/browser-plugin/.claude/review-2026-04-17.md`:

- **`history.state` buffer reuse (#8.2 H5/A2):** new `createUpdateBrowserState()`
  factory returns a closure that reuses one mutable `{ name, params, path }`
  object across `pushState`/`replaceState` calls. Browsers structured-clone
  `history.state` synchronously, so the buffer never escapes — eliminates
  one allocation per navigation on the hot path.
- **`getLocation` memoization (#8.2 A7):** the default `Browser` now caches the
  last `extractPath + safelyEncodePath` result keyed by `(pathname, search)`,
  so popstate-storms hitting the same URL do not re-encode every time.
- **`NavigationOptions.source` typed via module augmentation (#8.1):**
  `declare module "@real-router/types"` adds an optional `source?: string`
  field to `NavigationOptions`, replacing the
  `(navOptions as Record<string, unknown>).source` cast in
  `onTransitionSuccess`.
- **Internal class removed (#8.4):** the `BrowserPlugin` class was an
  `@internal` implementation detail — its constructor and `getPlugin()`
  method are now plain functions inside `factory.ts`, removing one source
  file and the only `export class` in the package.

No public API changes. The `createUpdateBrowserState` export from the private
`browser-env` workspace is available to other plugins (hash-plugin,
navigation-plugin) that want the same allocation savings.
