---
"@real-router/core": patch
---

Two more doors read a caller-supplied slot once ([#1930](https://github.com/greydragon888/real-router/issues/1930))

**`cloneRouter` read `opts.logger` twice** — the truthiness test decided the
branch, the spread supplied the value. `CloneOptions` is unvalidated and
application-owned, so both are calls into application code, and the second answer
is what shipped: a slot answering a per-request config first and `{}` second gave
the clone the BASE router's callback. That is the process-wide sink the option
exists to escape, on the per-request path (`createRequestScope`) it is documented
for. Same shape as the two substitutions directly below it, both already fixed
for this class.

**The FSM read its edge declarations three times each** — `!== undefined`, the
`typeof` validation, and the value stored — and `initial` three times, once for
`#state`, once for the declaredness check, once for `#currentTransitions`. Those
two fields ARE the machine, so a drifting `initial` leaves `getState()` reporting
one row while `canSend` answers another's, and a drifting `update` throws after
the state has already swapped. Latent — the shipped router builds its table from
a module constant — but the primitive's own threat model is a table it does not
own.

⚠ The issue's third site, `withholdFilledSlots`, does **not** reproduce on this
base: [#1847](https://github.com/greydragon888/real-router/issues/1847) already
made it return a copy and read the route's `defaultSearch` once. Measured on both
doors and in the `/u/:theme?theme` carve-out where the withhold is active —
`buildPath` and `navigate` agree at one read each.
