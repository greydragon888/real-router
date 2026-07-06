---
"@real-router/core": patch
---

Clearer rejection message for a name-less parameter marker or modifier (#1241)

Registering a static segment with a trailing `?` (`/faq?`) — which the optional fork routes through the same name-less check as a bare `:`/`*` — threw `Empty parameter name: a bare ':' marker …`, naming a `:` the segment does not contain. The message is now marker-agnostic (`a parameter marker (':' or '*') or an optional '?' must be followed by a name …`), so it is accurate for the bare `:`/`*`, the modifier-only (`:?`, `:<\d+>`), and the trailing-`?`-on-static cases alike. The rejection itself is unchanged.
