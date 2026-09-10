---
"@real-router/vue": patch
---

`collectElements` reads the caller's `type` once

The accumulator introduced in #2203 asked the caller's VNode for `type` twice — once against `MARKER_TYPES` and once against `Fragment`. That is the #2085 class: a caller-owned slot read more than once, where an accessor-backed or Proxy VNode can answer differently on the second read. The old shape read twice too, but from an element of an array core had built itself, so the slot was core's own.

The read is hoisted into a local. Behaviour is unchanged; `read-count-authority` in core derives that site set across every package and no longer lists this one.
