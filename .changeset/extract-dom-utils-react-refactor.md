---
"@real-router/react": patch
---

Extract shared DOM utilities into dom-utils package (#342)

Internal refactoring — no public API changes. `shouldNavigate`, `buildHref`, `buildActiveClassName` moved from local `utils.ts` into shared private `dom-utils` package.
