---
"@real-router/validation-plugin": patch
---

Reject name-less parameter markers (`:`/`*` with no name) at route validation (#863)

`validateRoute` now rejects paths whose `:`/`*` marker has no name — `/x/:`, `/x/*`, `/x/:?`, `/x/:<\d+>` — instead of letting them pass and fail later at the matcher (`registerTree`, #858) with a non-route-contextual error. Validation now fails fast with `[router.<method>] Invalid path for route "<name>": parameter marker (':' or '*') without a name`. The check derives from path-matcher's single `PARAM_NAME_PATTERN` grammar (so the validation gate cannot drift from the matcher) and scans only the URL-path portion, so a `:`/`*` inside a query declaration (`/x?:`) is not flagged. A bare `/*` is not a catch-all — use the named `/*rest`.
