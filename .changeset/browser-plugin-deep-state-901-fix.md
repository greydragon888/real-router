---
"@real-router/browser-plugin": patch
---

Validate deeply-nested `history.state` without overflowing the call stack (#901)

The re-exported `isState` guard (bundled `type-guards`) validated nested params with a recursive walk that threw `RangeError: Maximum call stack size exceeded` on objects nested past ~2.4k levels — reachable from an adversarial `history.state` on `popstate`. The walk is now iterative, so `isState` returns a boolean at any nesting depth instead of crashing the navigation.
