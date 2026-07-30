---
"@real-router/core": minor
---

The slot IS the channel — `params` and `search` now meet only in the URL (#1548)

`separateChannels` is deleted. The router no longer moves a key between the two
channels anywhere: `defaultParams` is the path channel and `defaultSearch` the
query channel, on a terminal route and on a forwarding hop alike, and the two
bags meet in exactly one place — the printed URL.

The argument that kept the defaults split ("a hop can only spell a default in
`defaultParams`") was false: the chain fold reads `defaultSearch` two lines
above. And the routing hurt the author it claimed to help — a hop could not tell
which channel its own config would land in without reading a target that a
`forwardTo` CALLBACK may not determine until navigation time.

Two checks replace it, split by what is knowable when:

- **Registration** — a route's own `defaultParams` naming a key it declares with
  `?` is refused at `createRouter` / `add` / `replace` / `update` /
  `setRootPath`, prepare-then-commit, so a rejected batch leaves the store
  untouched. Without it the router builds a state out of config it accepted and
  its own always-on channel guard rejects it: `start()` throwing `WRONG_CHANNEL`
  about a bag you never passed.
- **Resolution** — a hop's `defaultParams` naming a key only the resolved TARGET
  declares is refused at the `forwardState` seam, with both route names in the
  message.

**Migration.** Move query defaults to `defaultSearch`. The error names the route,
the key and the slot.

Two pieces of machinery fell out as dead once nothing was split: the
cross-channel withholding loop in the chain fold (#1570 needed it only because
the split scattered a caller's value and its default across bags no merge
ranks), and `search-schema-plugin`'s own copy of the split.

Measured radius: 29 tests across 3 packages (core, `search-schema-plugin`,
`browser-plugin`); the other 14 packages needed no change.

⚠ The first count said 28, and it was measured wrong rather than merely stale:
it came from `pnpm -F <pkg> test` alone, which runs the unit config. The property
tier is a separate config and a separate script, so a green `test` says nothing
about it — `search-schema-plugin`'s `pipeline.properties.ts` built a route whose
`defaultParams` named its own `?`-declared keys and stayed red, unseen, until it
was run directly.
