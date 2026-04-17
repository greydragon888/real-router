---
"@real-router/navigation-plugin": minor
---

Fix URL helpers and harden options validation (#470)

**URL helpers (from shared `browser-env`)**

- `normalizeBase` now collapses any run of slashes to a single `/` (previously `"/app//"` → `"/app/"`, `"//"` → `"/"`). Result is canonical: empty or starts with `/`, no trailing `/`, no `//` anywhere.
- `extractPath` now guarantees a leading slash in the no-match branch.
- `buildUrl` inserts the `/` separator when the path doesn't already start with one.
- New `extractPathFromAbsoluteUrl(url, base, context)` helper — alias of `urlToPath` with explicit defensive semantics. Used in `entryToState` and the entry URL path to swallow malformed Navigation API URLs as `null` instead of throwing.

**Plugin behavior**

- Entry URL parsing (`entryToState`, `#buildEntryUrl`) now uses the defensive `extractPathFromAbsoluteUrl`. Malformed entry URLs (e.g., from mocks, extensions, or non-spec sources) no longer throw from the Navigation API event handler — they resolve to `undefined` / trigger the "no matching route" branch.
- `browser.navigate(url, options)` now forwards the full `options` object to `nav.navigate` instead of picking only `state` and `history`. Lets callers pass `info`, `downloadRequest`, and any future Navigation API options transparently.
- `replaceHistoryState` now preserves `location.hash` — symmetric with `onTransitionSuccess`.
- `base` option is now validated against control characters and `..` segments (via the shared `safeBaseRule`).
- Dropped the unused third `title?: string` parameter from `replaceHistoryState` type augmentation.
- `shouldReplaceHistory` behavior for `{ replace: false, fromState: undefined }` is now confirmed as `false` (explicit user override). The invariant G4 description was rewritten — it no longer claims the function throws.

**Internal / performance**

- `onTransitionSuccess` now composes the URL via `buildUrl(toState.path, base)` instead of `router.buildUrl` dispatch — saves one method lookup per navigation. Tests spying on `router.buildUrl` inside `onTransitionSuccess` must spy on the browser-env `buildUrl` instead.
- The hash-preservation branch skips the `url + ""` concatenation when the hash is empty.
- Extracted `withRecovery(run)` helper in `navigate-handler.ts` — dedupes the two `try { await ... } catch { recoverFromNavigateError }` blocks.

**Breaking (pre-1.0):**

- `replaceHistoryState(name, params, title)` no longer type-checks — drop the third argument.
- `base: "../evil"` and `base: "/app\nX"` now throw at factory time instead of silently passing through.
