---
"@real-router/core": patch
---

`makeState` and `buildNavigationState` judge the bag they print from (#2134)

The plugin-facing half of the same defect the façade doors carried. Both take a
caller bag, hand it to a value-walking validator, and read it again to build the
URL — so with `@real-router/validation-plugin` installed a key that answers
differently per read was admitted on one value and printed with another.
Measured: bare core printed `/u/v1`, the plugin arm `/u/v2`. Both now print
what bare core prints.

⚑ `forwardState` is measured and deliberately NOT changed. It hands the
container back rather than printing from it — by identity on a clean bag, which
`handed-out-containers-1957` pins — and on a non-forwarding route core reads the
bag zero times through it. There is no shipped read for a judged one to disagree
with, and a copy would trade that pinned identity for nothing.

⚠ `adoptChannel` now copies only what is SHAPED like a bag and returns anything
else unchanged. Copying first would launder: a copy of a string is
`{0:"a",1:"b"}` and a copy of a class instance has lost its prototype, so the
validating layer would be handed an acceptable object built out of one it
refuses. Returned unchanged, such a value reaches that layer as the caller wrote
it and is refused in the words that door already uses — the messages are
unchanged. A null-prototype bag IS copied: `Object.create(null)` is a legal
params bag.
