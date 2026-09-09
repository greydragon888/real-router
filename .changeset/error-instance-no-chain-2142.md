---
"@real-router/core": patch
---

`setErrorInstance` records the native error's `cause` as own data (#2142)

The slot was copied with `[[Set]]`, and `cause` has no own slot on an `Error`
instance unless the constructor was handed one — which this class never is. So an
ambient `Object.prototype.cause` took the value and left `cause` absent, and a
getter-only one made the assignment THROW. The throw is the worse half: this
method is what wraps a native failure into the router's own error, so it replaced
the error being reported with a different one, raised from inside error handling.

⚠ The report names `message`, `cause` and `stack`; the set was recounted rather
than taken, and only **one** of the three was ever live. `super(message ?? code)`
always passes a string, so `message` is own on every instance, and the `Error`
constructor installs `stack`. Both assignments define own data and cannot reach
the chain. The fixture keeps rows for all three — two of them as controls that
were green before this fix and stay green after it.
