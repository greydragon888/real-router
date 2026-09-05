---
"@real-router/persistent-params-plugin": patch
---

State the boot-time guard's rule rather than its history (#2091)

The comment over the array branch's `putField` explained the guard through the
failure that motivated it, in the past tense, which `packages/core/CLAUDE.md`
forbids in source docblocks. It also pointed at an `Object.assign` "below" that
the file does not contain — the else branch calls `copyFields`.

It now states the standing rule and names the code that is actually there.
