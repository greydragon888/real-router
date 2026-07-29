---
"@real-router/validation-plugin": patch
---

Warn when a param key is declared nowhere on the route (#1579)

`state.reportUndeclaredParamKey` implements core's new opt-in sink: a key the
route names neither as a path slot nor with `?` stays in `state.params` but never
reaches the URL, so the state cannot be rebuilt from its own `state.path`.

De-duplicated per route + key, like the mode gate's diagnostic — this runs on
every navigation, and an un-deduped warning would flood the console on a revisit.
The message names the key and the route, states what happened, and offers the
three ways out: declare it on the path, pass it through the `search` channel, or
keep it deliberately as app-level data.
