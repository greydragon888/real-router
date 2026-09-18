---
"@real-router/core": minor
---

`navigate` and `canNavigateTo` stop consulting the validator (#2388)

Both doors register all nine of their refusals on the check channel, at four new
positions: `navigate:entry`, `navigate:params`, `canNavigateTo:entry` and
`canNavigateTo:params`. Messages, order and failure shape are unchanged.

**Two members leave `RouterValidator`**, because these were their last
consultations in core:

- `navigation.validateParams` — its four callers (both printers in the previous
  slice, these two doors now) are all checks.
- `navigation.validateNavigateArgs` — `navigate` was its only caller.

`@real-router/validation-plugin` registers the same walks; nothing an
application observes moves.

⚠ **An entry position is one position per door, not one per consultation.** The
three or four calls a door made are run in order by a single check, because the
first refusal is the message the caller gets and reordering them changes which
defect a caller hears about.

⚠ **`canNavigateTo` stays total in bare core.** With no plugin nothing is
registered and the predicate answers as before; the refusal is the analyser's
documented divergence, the same shape it had when the validator answered there.

⚠ **`navigate` is converted at the FACADE only.** The pipeline underneath still
consults `routes.validateStateBuilderArgs` on the state it builds — a door is
converted at its own layer, and the remainder is pinned rather than described.
