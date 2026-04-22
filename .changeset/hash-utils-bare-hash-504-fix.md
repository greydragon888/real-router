---
"@real-router/hash-plugin": patch
---

Fix `extractHashPath("#", regex)` returning `"#"` when `hashPrefix` is configured (#504)

A bare `#` or empty hash now consistently resolves to `"/"` regardless of the configured `hashPrefix`. Previously, when a non-null `prefixRegex` was compiled (e.g. from `hashPrefix: "!"`), a bare `#` was returned verbatim because the regex did not match, and the `path || "/"` fallback was never triggered.

**Impact:** `router.matchUrl("https://example.com/#")` now correctly matches the index route instead of returning `undefined` when a non-empty `hashPrefix` is configured.

```diff
  export function extractHashPath(hash: string, prefixRegex: RegExp | null): string {
+   if (hash === "" || hash === "#") {
+     return "/";
+   }
    const path = prefixRegex ? hash.replace(prefixRegex, "") : hash.slice(1);
    return path || "/";
  }
```
