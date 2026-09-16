---
"@real-router/validation-plugin": minor
---

Teardown no longer nulls a validator slot it no longer holds (#2339 §4 1b)

`RouterInternals.validator` has no owner: it is plain data on a surface pinned
`accessorNames === []`, so a second writer cannot be refused at the slot. What
it can be is not silently destroyed. The plugin now remembers the object it
wrote and releases the slot only while it is still the holder — the release half
of the shape `claimContextNamespace` uses on both write and release
(#2059 / #1929).

Measured before the change, with a control: with a second writer in place,
`teardown()` set the slot to `null` and destroyed the foreign validator; with no
second writer it correctly nulled its own. #2349 closed the neighbouring half —
a second `validationPlugin()` install is refused — but that guard reads the
slot, so a direct write still lands.

The write half stays open deliberately: refusing a second write needs an
accessor on `RouterInternals`, and `accessorNames === []` is pinned on all six
handed-out surfaces. It is answered where the slot goes away, not here.
