---
"@real-router/memory-plugin": patch
---

Hot-path and code-quality cleanup from audit (#508, #510)

Audit follow-up — items from `packages/memory-plugin/.claude/review-2026-04-22.md`:

- **`MemoryContext` per-call freeze removed (#8c.1):** `#writeMemoryContext` no
  longer wraps the `{ direction, historyIndex }` literal in `Object.freeze()`
  on every successful transition. The freeze was a half-measure — `state.context`
  itself is intentionally **not** frozen by core (`packages/core/src/helpers.ts`),
  so a consumer can already overwrite `state.context.memory = {...}` regardless.
  Immutability is now expressed at the type level: both fields of
  `MemoryContext` are marked `readonly`. Eliminates one freeze (~18ns) per
  successful navigation on the hot path.
- **`#go(delta)` promise chain flattened (#8c.2):** `.catch().finally()` was
  replaced with `.then(onResolve, onReject)`. The reject handler now performs
  both the `#index` revert and the `#navigatingFromHistory` flag reset, so the
  observable behaviour is unchanged. Saves one promise + one microtask per
  `back()` / `forward()` / `go(delta)` invocation.
- **Redundant `Number.isFinite` check dropped (#9.3):** the guard at the top of
  `#go(delta)` simplified from
  `delta === 0 || !Number.isFinite(delta) || !Number.isInteger(delta)` to
  `!Number.isInteger(delta) || delta === 0`. `Number.isInteger` already returns
  `false` for `NaN`, `±Infinity`, fractional values, and non-numbers, so the
  finite-check was redundant. Existing functional tests for `go(NaN)`,
  `go(Infinity)`, `go(-Infinity)`, `go(0.5)`, `go(-1.7)` continue to pass.

No public API changes. The frozen-context test
(`tests/functional/plugin.test.ts` — "context.memory is frozen") was updated
to assert the structural shape via `toStrictEqual` instead of
`Object.isFrozen`. If your code branches on `Object.isFrozen(state.context.memory)`,
update it to rely on the `readonly` typing instead.
