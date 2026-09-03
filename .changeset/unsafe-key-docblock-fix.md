---
"@real-router/core": patch
---

Two claims in the `UNSAFE_KEY` docblock, corrected (#2071)

The docblock said `channels/modeGate.ts` and `channels/defaults.ts` "name it
now". Neither decides by that name: both write through `putField`, which keeps
every name, and the commit that moved them there is the one that wrote the
sentence. The paragraph carried nothing else — it described the retirement of an
earlier note — so it is gone rather than restated.

It also counted "the five sites that name it in `helpers.ts`". There are six
functions (`mergeDefined`, `adoptForeignBag`, `adoptNavigationOptions`,
`normalizeChannel`, `dropUnsafeKey`, `withoutUnsafeKey`) across eight lines, and
all six existed before the count was written. The count is dropped rather than
raised: the claim that matters is _why_ those sites name it, and a number in a
docblock is a promise to re-measure it.

And it called `handed-out-containers-1957.test.ts` "the derived table". That file enumerates the doors by hand; nothing there scans `src`, so a door added to a seam it already covers does not appear in it on its own. The line says which it is.
