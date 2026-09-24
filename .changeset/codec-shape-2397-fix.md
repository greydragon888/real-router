---
"@real-router/core": patch
---

`decodeParams` and `encodeParams` must be functions at every registration door (#2397)

`createRouter`, `add`, `replace` and `update` refuse a `decodeParams` or
`encodeParams` that is truthy but not a function — a number, an object, `true`,
an array, a `Symbol`, a string — with `TypeError: [router] Route "<name>"
decodeParams must be a function` (or `encodeParams`), naming a nested route by
its full dotted name. Such a value was otherwise stored, and the first read of
the route failed far from its cause, naming neither the route nor the field:
`matchPath` threw and `start` rejected with `TypeError: decode is not a
function` (`encode …` for an encoder, which broke `buildPath` as well;
`decoder …` / `encoder …` after `update`). `replace` on a started router whose
URL resolved to such a route threw only after it had swapped the route table and
announced the change.

Core still drops a falsy value (`0`, `false`, `NaN`, `""`) rather than refusing
it, `update(name, { decodeParams: null })` still removes the codec, and an async
codec is still admitted (#2348).

The refusal happens at construction, so a route config carrying such a value
fails in `createRouter` even when that route is never read. With
`@real-router/validation-plugin` installed before `add` or `replace`, the plugin
refuses first with the same sentence under `[router.addRoute]`: its check now
names a nested route in full too, and when both codecs are wrong both layers name
the encoder. Before `update`, the plugin refuses with its own `decodeParams must
be a function or null, got number`.
