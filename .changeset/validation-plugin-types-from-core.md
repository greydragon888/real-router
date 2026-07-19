---
"@real-router/validation-plugin": patch
---

Source types from `@real-router/core` (was the now-folded `@real-router/types`) (#1520)

Type imports move `@real-router/types` → `@real-router/core`, and the `StateContext`
module augmentation retargets `declare module "@real-router/types"` → `"@real-router/core/types"`
(wave-2 fold). Internal repackaging — no public API or runtime-behaviour change.
