---
"@real-router/ssr-data-plugin": patch
---

`defer()` reads the caller's deferred bag once, and ships what it validated (#1914)

The validation loop walked `options.deferred` and the payload spread it again —
two independent `[[Get]]` chains. For an accessor-backed bag, which is the
natural spelling of a lazy deferred value, the checked value and the shipped one
were different objects. Measured through the public export:

```
reads of the getter for ONE declared key           : 2
thenable guard admitted a non-promise into payload : "NOT-A-PROMISE"
rejection of read #2                               : UNHANDLED
```

⚠ A second axis, not in the issue: `options.deferred` itself was read **five**
times. A getter there swapped the whole bag — validation ran over `{a}` while the
payload shipped `{b}` — so the reserved-key refusal (`__proto__`, `constructor`,
`prototype`) applied to keys that never reached the wire.

`defer()` now snapshots once, validates the snapshot, and freezes that same
object. The `.catch()` it attaches is therefore on the promise that ships, which
is what `packages/ssr-data-plugin/CLAUDE.md` already promised and could not
deliver.
