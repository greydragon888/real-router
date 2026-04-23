---
"@real-router/browser-plugin": patch
"@real-router/hash-plugin": patch
"@real-router/navigation-plugin": patch
---

Fix `buildUrl("/", base)` producing trailing-slash index URLs

`buildUrl("/", "/app")` previously returned `"/app/"` (with trailing slash) for the index route under a non-empty base. That disagreed with the canonical form `normalizeBase("/app/") === "/app"` and produced asymmetric URLs in `browser.history`. The function now collapses index-under-base to the bare base (`"/app"`), keeping URLs symmetric. Roundtrip is preserved: `extractPath("/app", "/app") === "/"`.
