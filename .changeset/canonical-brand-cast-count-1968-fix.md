---
"@real-router/core": patch
---

The `Canonical` brand's records say how many cast sites there are (#1968)

Three records claimed the brand had a single cast site. There are two, at
opposite ends of the same function — `canonicalize`'s fast path and its slow
path.
`canonicalize.ts` said "the one and only cast to the brand in the codebase",
which the site above it contradicted; `pipeline/types.ts` and
`pipeline/CLAUDE.md` said "the single cast site is `canonicalize`", true of the
FUNCTION and false of the count, inside the paragraph whose subject is exactly
what the brand does and does not guarantee.

Comments and docs only — both casts apply to already-snapshotted values, so
nothing was fabricated and no behaviour changes. The count is now also a test
(`canonical-brand-authority-1968`), because the number is the load-bearing half
of the claim: a third cast appearing anywhere is what these records exist to make
noticeable, and prose is what rotted.
