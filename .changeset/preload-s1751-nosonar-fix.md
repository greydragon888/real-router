---
"@real-router/preload-plugin": patch
---

Suppress SonarJS S1751 false positive in `#cacheState` LRU eviction (#971)

The single-eviction iterator destructuring (`const [oldest] = this.#stateCache.keys()`) is correct — insertion-order eviction at the 32-entry bound, 100% branch coverage — but SonarJS S1751 flags it (and the prior `for…of`+`break`) as a one-iteration loop, reding the SonarCloud quality gate (`new_reliability_rating` C). Annotate the line with `// NOSONAR` — the repo's established convention for verified false positives — instead of churning the code form a third time. No public API, behavioral, or runtime change.
