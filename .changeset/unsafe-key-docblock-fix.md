---
"@real-router/core": patch
---

The `UNSAFE_KEY` docblock is a pointer now (#1957 #2071)

It had grown to 127 lines on a one-line string constant — 16 claims where the
median docblock in `core/src` is 8 lines — and almost all of it was a second copy
of `INVARIANTS.md`, which already owns the hand-out rule, the door census, the
exempt doors and the one-level guarantee.

The two copies had already diverged, which is the reason rather than the
aesthetics: the docblock counted FOUR exempt doors and `INVARIANTS.md` FIVE
(`forwardState` stopped being a pass-through at #1986, and only one copy heard);
both called `handed-out-containers-1957.test.ts` "derived" without saying over
what, and that over-claim is what let a second door on the `forwardState` seam
join without the table noticing; and two more claims in the docblock were false
on arrival — that `channels/modeGate.ts` names the key (it goes through
`putField`, which keeps every name) and that five sites in `helpers.ts` name it
(six functions, eight lines).

What stays on the constant is what only it can say: that `__proto__` is the sole
accessor among `Object.prototype`'s twelve own members, that core refuses the key
nowhere, and where the rule lives. What had no other home moved rather than
vanished — the null-prototype entry exemption, the pin for the un-sanitised
`NavigationOptions` arc and the internals-handle reason into `INVARIANTS.md`, the
"ownership, not reachability" rule for guard authors into `packages/core/CLAUDE.md`,
and the boundary that core does not defend against a bag mutating under it into
`INVARIANTS.md`'s input-shape section, where it was missing.
