---
"@real-router/core": patch
---

Record what the transition meta's entry snapshot costs, and that the obvious remedies are refuted (#1728)

Documentation only — no behaviour change, no runtime change.

`0.89.9` moved the transition meta's three flags (`reload` / `replace` /
`redirected`) onto a snapshot taken at the navigation's entry, so the commit no
longer reads the caller's `NavigationOptions`. That is what makes the window
between the commit ask and the send empty structurally rather than by an ordering
rule. It costs **≈15 %** on `navigate/sync-baseline` and ≈12 % on
`navigate/pre-commit-listener`; every other benchmark is unchanged.

The cost is accepted rather than reverted: without the snapshot, the same
guarantee rests on a rule that has been got wrong twice on record, and a
structure does not admit that class of mistake. What is recorded here — in the
`NavigationContext` docblock and in `IMPLEMENTATION_NOTES.md` — is the
measurement table and the five suspects already eliminated, so the next reader
does not re-propose a remedy that was tried: the plan literal's width, the call
shape, the entry reads, field count as such, and the runner are all ruled out.
What survives is narrower — a field added to that literal **and then read inside
the commit** costs, while adding it without reading it does not — and the
mechanism is still unexplained, tracked in #1728.
