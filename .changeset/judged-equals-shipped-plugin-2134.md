---
"@real-router/validation-plugin": patch
---

Params validation splits into a shape half and a value half (#2134)

`validateParams` used to walk the caller's bag twice — once for the value
messages and once inside the `isParams` type guard — ahead of core's own read.
Every one of those walks is a call into application code, and the values they
judged were not the values core shipped.

The two halves now run on two different objects, because they belong to two
different objects. `validateParamsShape` judges the SHAPE on the caller's own
value, before core copies: a copy of anything is a plain object, so `"abc"`
would arrive as `{0:"a",1:"b",2:"c"}` and a class instance without its
prototype — judged after the copy, every shape this refuses would be laundered
into an acceptable one. `validateParams` then judges the VALUES on core's copy,
which is the object the URL is built from.

Measured across the four façade doors that take a path bag: `buildPath` 3 reads
of the caller's bag → 1, `navigate` 4 → 1, `canNavigateTo` 3 → 1. The remaining
read is core's own, and it is the one that ships.

⚠ `isActiveRoute` is unchanged and still reads once more than bare core, which
reads nothing at all when the link is inactive. Closing that row is a separate
decision: the door ships no value, so the fix is not a copy.
