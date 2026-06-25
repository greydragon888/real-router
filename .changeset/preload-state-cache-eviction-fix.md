---
"@real-router/preload-plugin": patch
---

Clear SonarJS S1751 in `#cacheState` LRU eviction (#971)

Replace the single-iteration `for…of` + `break` that dropped the oldest cache entry with iterator destructuring (`const [oldest] = this.#stateCache.keys()`). Behavior is unchanged — insertion-order eviction at the 32-entry bound, 100% branch coverage preserved — this only removes a Major reliability finding (`new_reliability_rating` C) that was reding the SonarCloud quality gate. No public API or behavioral change.
