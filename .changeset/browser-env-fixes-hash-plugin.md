---
"@real-router/hash-plugin": minor
---

Fix URL helpers and harden options validation (#470)

**Base path normalization (from shared `browser-env`)**

- `normalizeBase` now collapses any run of slashes to a single `/` (previously `"/app//"` → `"/app/"`, `"//"` → `"/"`). Result is canonical: empty or starts with `/`, no trailing `/`, no `//` anywhere. Affects hash-plugin because the factory passes `base` through `normalizeBase`.

**Plugin behavior**

- `base` option is now validated against control characters and `..` segments (via the shared `safeBaseRule`).
- `hashPrefix` option is now validated against `/`, `#`, `?`, and control characters (via the new shared `safeHashPrefixRule`). Previously `hashPrefix: "/"` silently produced `#//path` URLs and broke `matchPath` on `getLocation()` because `extractHashPath` stripped the leading `/`.
- `matchUrl` no longer concatenates the outer query (`?a=1` before `#`) with the inner hash query — inner wins. Previously `matchUrl("example.com/?a=1#/users?page=2")` produced the malformed path `/users?page=2?a=1`. Same fix applied to the default `getLocation` closure the factory builds.
- Dropped the unused third `title?: string` parameter from `replaceHistoryState` type augmentation.
- `replaceHistoryState` explicitly opts out of the new shared hash-preservation behavior (passes `preserveHash: false`) — hash already encodes the route.

**Breaking (pre-1.0):**

- `replaceHistoryState(name, params, title)` no longer type-checks — drop the third argument.
- `base: "../evil"` and `base: "/app\nX"` now throw at factory time instead of silently passing through.
- `hashPrefix: "/"`, `"#"`, `"?"`, or values with control characters now throw at factory time.
