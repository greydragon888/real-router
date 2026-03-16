# event-emitter

## 0.1.1

### Patch Changes

- Eliminate V8 rest-param array allocation in `emit()` — use explicit params `(a?, b?, c?, d?)` instead of `...args` (#307)
- Add single-listener fast path in `#emitFast()` — skip `[...set]` snapshot when `set.size === 1`
- Skip snapshot in `#emitWithDepthTracking()` for single listener (`set.size === 1`)
- Replace `Function.prototype.apply` fallback with direct 4-arg call in `#callListener()`

## 0.1.0

### Minor Changes

- Initial release — generic typed event emitter extracted from @real-router/core
