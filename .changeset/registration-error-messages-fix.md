---
"@real-router/core": patch
---

Correct and shorten the registration error messages (#2010)

Three messages explained a build↔trie disagreement that no longer exists.
Measured, `buildParamMeta` reads the same `parseSegment` tokenizer the trie
does and extracts nothing from a malformed segment, so "build extracts it as a
param" (#1050, fused marker) and "build/meta would capture the marker into the
name" (#1324, trailing marker) were false; the trailing-marker message also
claimed the gate rejects the spelling as `name-less`, while the gate reports
`trailing-marker`.

Two more were wrong about what they were describing: a splat conflict was
called "a parametric URL segment" (#736), and a duplicate name was quoted with
a hardcoded `':'` prefix even though the check covers splats (#1151), so `/:x/*x`
reported `':x'` for a clash whose second position is `*x`. `throwEmptyParamName`
led with a marker rule for `/faq?`, which carries no marker.

The messages keep the diagnosis, the offending text and the fix, and drop the
mechanism theory — 26% shorter. They ship in the main chunk, so the cost is
paid by every consumer.

`throwSlashChildUnderDynamicParent` is renamed `throwIndexUnderSplatParent`:
the rule is about splat parents only, and an index under a `:param` parent
registers fine.
