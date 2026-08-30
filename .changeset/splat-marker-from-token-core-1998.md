---
"@real-router/core": patch
---

`processSegment` asks the tokenizer what a segment is ([#1998](https://github.com/greydragon888/real-router/issues/1998))

The trie's per-segment walk decided splat-ness and param-ness from the raw
leading character (`segment.startsWith("*")`, `startsWith(":")`) and then called
a wrapper that ran `parseSegment` anyway to get the name. It now parses once and
branches on `token.kind`.

**No behaviour change** — measured, the whole suite is green and the gate ↔
backstop parity property still holds. This was the last place in `path-matcher`
where "is this a splat" was spelled twice, and the class had already produced
two real defects: [#1975](https://github.com/greydragon888/real-router/issues/1975)
(splat-ness derived from a set of NAMES, filtered differently by the finality
rule — a silently wrong URL) and
[#1996](https://github.com/greydragon888/real-router/issues/1996) (the marker
read off a sliced raw path, defeated by a trailing slash).

⚑ It removes a parse rather than adding one: the second `parseSegment` call
inside the name wrapper is gone. Measured on registration of a 60×4-route tree,
0.586 / 0.575 ms against a 0.591 / 0.614 ms baseline — inside the A/A spread,
even though a static segment is now parsed where it was not.
