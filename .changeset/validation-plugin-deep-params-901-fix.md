---
"@real-router/validation-plugin": patch
---

Validate deeply-nested params without overflowing the call stack (#901)

`isParams` / `isState` (bundled `type-guards`) validated user-supplied params with a recursive walk that threw `RangeError: Maximum call stack size exceeded` on objects nested past ~2.4k levels — reachable from deeply-nested params passed to `navigate` / `makeState`. The walk is now iterative, so validation returns a boolean (and the plugin's contextual `TypeError`) at any nesting depth instead of crashing with an unrelated `RangeError`.
