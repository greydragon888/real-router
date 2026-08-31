---
"@real-router/core": patch
---

`isActiveRoute` no longer throws into the render on a throwing route name (#1946)

`isActiveRoute` promises to answer rather than throw — it runs on every `<Link>`
in six adapters. On the NAME operand it did not: a name whose `toString` throws
propagated the caller's error out of the predicate.

Two causes, both fixed:

- The two handlers that log before answering `false` interpolated the name into
  their own message, so the handler written to absorb a throw raised one of its
  own. They now print through a helper that reads nothing.
- The per-route forward gate asked `Object.hasOwn(map, name)` twice, outside any
  handler. It binds one key inside a `try` and answers `false` on a throw — which
  also stops the two lookups from asking the same question of two different reads.

A string name is unaffected, and a stable non-string still answers what its
`toString` names. Swept over the read position, both arms of the predicate.
