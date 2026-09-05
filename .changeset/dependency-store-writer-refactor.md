---
"@real-router/core": patch
---

Give the dependency store's computed-key write one owner (#2091)

The constructor door and `setAll` both install judged pairs into the
`Object.create(null)` dependency store, and each carried its own copy of the
same seven-line justification over its own SAST suppression — one fact, two
restatements, nothing binding them.

Both now write through `storeDependency`, so the reasoning and the suppression
exist once. `computed-key-write-authority-1852` classifies one site instead of
two, which is what makes the collapse checkable rather than a matter of style.
No behaviour change.
