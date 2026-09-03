---
"@real-router/validation-plugin": minor
---

Drop the hand-written mirror of core's interceptable set (#2088)

`validateAddInterceptorArgs` kept its own `["start", "buildPath", "forwardState"]`
list, correct but anchored to nothing — core had no runtime authority for the set,
only a type the plugin cannot consult. Core now refuses an unknown method and a
non-function interceptor itself, from the object its wrappers are named from, so
the mirror is dead code and goes, along with the member it implemented on
`RouterValidator`.

The message a plugin author sees is unchanged for a string method name; core
publishes it now.
