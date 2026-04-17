---
"@real-router/browser-plugin": minor
---

Fix URL helpers and harden options validation (#470)

**URL helpers (from shared `browser-env`)**

- `normalizeBase` now collapses any run of slashes to a single `/` (previously `"/app//"` → `"/app/"`, `"//"` → `"/"`). Result is canonical: empty or starts with `/`, no trailing `/`, no `//` anywhere.
- `extractPath` now guarantees a leading slash in the no-match branch (`extractPath("users", "/app")` → `"/users"`, previously `"users"`).
- `buildUrl` inserts the `/` separator when the path doesn't already start with one.

**Plugin behavior**

- `replaceHistoryState` now preserves `location.hash` — symmetric with `onTransitionSuccess`.
- `base` option is now validated against control characters and `..` segments (via the shared `safeBaseRule`).
- Dropped the unused third `title?: string` parameter from `replaceHistoryState` type augmentation.

**Internal / performance**

- `onTransitionSuccess` now composes the URL via `buildUrl(toState.path, base)` instead of the `router.buildUrl` dispatch — saves one method lookup per navigation. Tests that spied on `router.buildUrl` inside `onTransitionSuccess` must now spy on the browser-env `buildUrl` instead.
- `BrowserContext` payloads are frozen once at module load (`FROZEN_POPSTATE`, `FROZEN_NAVIGATE`) and reused per transition instead of being recreated and frozen on every write.
- The hash-preservation branch skips the `url + ""` concatenation when the hash is empty.
- Internal constant `source` renamed to `POPSTATE_SOURCE` — no public API impact.

**Breaking (pre-1.0):**

- `extractPath("", base)` returns `"/"` instead of `""`. In practice this only affects custom callers — production code always passes `url.pathname`, which starts with `/`.
- `replaceHistoryState(name, params, title)` no longer type-checks — drop the third argument.
- `base: "../evil"` and `base: "/app\nX"` now throw at factory time instead of silently passing through.
