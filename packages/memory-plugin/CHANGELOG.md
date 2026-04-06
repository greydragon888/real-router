# @real-router/memory-plugin

## 0.1.0

### Minor Changes

- [#410](https://github.com/greydragon888/real-router/pull/410) [`546706b`](https://github.com/greydragon888/real-router/commit/546706b65af2ba9f46ad33666fada7e6a58ca6f3) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix index desync when guard blocks back/forward navigation ([#294](https://github.com/greydragon888/real-router/issues/294))

  `#go(delta)` now updates `#index` in `.then()` instead of synchronously before `navigate()`. If a guard blocks the navigation, the index stays unchanged — `canGoBack()`/`canGoForward()` always reflect the actual router state. Also adds early return for `go(0)`.
