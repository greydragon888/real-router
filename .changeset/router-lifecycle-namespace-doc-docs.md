---
"@real-router/core": patch
---

`RouterLifecycleNamespace`'s doc names the surface it actually has (#1648)

The class doc advertised two things it does not own. `stop()` is not a method
here — the class exposes `setDependencies` and `start`, and stopping is the
facade sending `STOP`, whose edge `update` (`clearCurrent`) shifts the committed
pair; a namespace method would be a second writer of state the table owns. And
`isStarted` has no definition anywhere in `src` other than that sentence — the
live accessor is `isActive()`, which reads the FSM.
