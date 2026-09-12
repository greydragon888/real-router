---
"@real-router/core": patch
---

`extendRouter` refuses an argument it would otherwise write onto the router (#2243)

`PluginApi.extendRouter` never checked the shape of its argument. A string got
its own enumerable keys copied onto the live router — `Object.keys("ab")` is
`["0","1"]`, a router holds no numeric keys so the collision check passed, and
the loop assigned them. Nothing reported it, and every later reader saw keys
nobody declared.

The door now runs an always-on shape guard. It meets criterion (a), and what
sets it apart from the rest of the set is the TARGET: the refused write lands on
the router instance itself rather than in an internal registry. Its predicate is
the dependency door's, extracted and shared, so `Object.create(null)` is admitted
at both and an array at neither — though the doors part beyond that predicate,
since the dependency path also bans getters and this one reads them.

Also closes two lesser arms of the same door: `extendRouter(42)` was a silent
no-op returning a working `Unsubscribe`, and `extendRouter(null)` threw a bare
intrinsic `TypeError` with nothing naming the caller.

Tightening: an argument that is not a plain object is now refused where it was
previously admitted. Every `extendRouter` call site in this repository passes an
object literal, so no shipped plugin changes behaviour.
