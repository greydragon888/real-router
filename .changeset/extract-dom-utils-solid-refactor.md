---
"@real-router/solid": patch
---

Extract shared DOM utilities into dom-utils package (#342)

Internal refactoring — no public API changes. `shouldNavigate`, `buildHref`, `buildActiveClassName`, `applyLinkA11y` moved from local code into shared private `dom-utils` package.
