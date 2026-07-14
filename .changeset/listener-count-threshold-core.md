---
"@real-router/core": minor
---

Call the validator's listener-count threshold from `subscribe` / `addEventListener` (#1188)

`EventBusNamespace` now reads the per-event listener count and calls the opt-in `RouterValidator.eventBus.validateCountThresholds` on each `subscribe` / `addEventListener`, mirroring the plugins / lifecycle / dependencies counters. The new interface method and `wireEventBus` accessor are additive; without `@real-router/validation-plugin` the accessor returns `null` and the call is a no-op, so the bare-core hot path and the emitter's bare-`Error` hard cap are unchanged.
