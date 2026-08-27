---
"@real-router/core": minor
---

`set` and `remove` read a dependency name once (#1843)

A dependency name is used as a PROPERTY KEY, so every bare
`store[name]` / `Object.hasOwn(store, name)` runs `toString` on a non-string
value — a call into application code. `setDependency` made three such calls and
`remove` two, with nothing pinning the result between them, so the key that was
CHECKED was not the key that was written or deleted.

Measured through the public API with a name answering `"alpha"` on the first read
and `"beta"` afterwards, against a store holding `{ alpha: 1, beta: 2 }`:

- `remove` reported nothing (its existence check found `alpha`) and deleted
  **`beta`**;
- `set` took the OVERWRITE arm on `alpha` — so the new-key limit check was
  skipped entirely — and then wrote a new key `beta` that had never been counted;
- the mirror direction destroyed `alpha` with no overwrite diagnostic, because
  the check had asked about the absent `beta`.

Both doors now coerce once, at the top, and use that one key for the check, the
old-value read, the diagnostic and the write. Nothing changes for a string name
on any arm.

⚠ Scope: **bare core only.** Unlike the sibling fix to `resolveForwardChain`,
these doors DO have a validator seam — with `@real-router/validation-plugin`
installed, `validateDependencyName` refuses a non-string at **0** coercions, so
the defect was never reachable there. This is the usual split (core degrades, the
opt-in plugin diagnoses); what it buys is that the degradation is now the one the
door's FIRST read names instead of an arbitrary later one.

⚠ A **symbol** name is deliberately left untouched. A symbol already IS a
property key, so there is no `toString` to drift and nothing to fix; coercing it
was measured first and moved `set` / `remove` to `"Symbol(x)"` while `has` / `get`
kept asking the symbol, so `set(S, 1)` followed by `has(S)` answered `false`.
Symbol behaviour is byte-identical to the previous release.
