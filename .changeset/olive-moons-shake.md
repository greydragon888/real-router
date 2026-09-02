---
"@real-router/core": patch
---

`extendRouter` installs nothing when a getter on the extension bag throws ([#1933](https://github.com/greydragon888/real-router/issues/1933))

The check loop was atomic, as the docs promise; the write loop was not. It read
the caller's getters while assigning, so a throw part way through left the
earlier keys installed on the router and the tracking record — pushed only after
the loop finished — never written. Those keys had no unsubscribe, survived
`dispose()` (its safety net walks that record), and made the names refuse every
later plugin with `PLUGIN_CONFLICT` for the life of the router.

Every value is now read before any is written, so the door is
prepare-then-commit like route CRUD. One read per key either way — the reads
move, they do not multiply.
