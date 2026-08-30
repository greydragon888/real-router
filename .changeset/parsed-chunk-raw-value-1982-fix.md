---
"@real-router/core": patch
---

The query parser carries the raw value, not a boolean about it (#1982)

`decodeParamValue` took a `hasValue` flag that it could derive from `eqPos` and
`end` — arguments #2 and #3 of the same call. The same fact was spelled twice,
and the two spellings then did the same work twice: the comma-array arm sliced
`searchPart.slice(eqPos + 1, end)` to get the raw value, and `decodeParamValue`
sliced it again.

The chunk now carries `rawValue: string | undefined` instead. `undefined` is a
key-only chunk; everything else derives from it. What goes beyond the flag:

- `decodeParamValue` disappears — its body was `decode(rawValue, strategies)`.
- `ParsedChunk` goes from **7 fields to 5**: `hasValue` becomes `rawValue`, and
  `eqPos` / `end` were only there to recompute the slice, so they go too.
- The comma arm reuses the value instead of cutting the string a second time.

⚠ `""` is a value, and it is falsy — every test is `!== undefined`, never
truthiness. Verified across the empty forms: `?a=` → `{a: ""}` while `?a` →
`{a: null}`, and the same distinction holds through bracketed (`?tags[0]=`) and
repeated (`?a=&a=`) chunks.

Nothing published changes: `decodeParamValue` was not exported and `ParsedChunk`
is file-local. Correctness is pinned by the existing search-params property
suites (`inverse-pair-brutal`, `parseBuild`, `formats`, `inversePair`).

No performance claim is made here — the figure in the issue came from the audit
that filed it and was not re-measured in this change. What can be said from the
diff alone is that the parser does strictly less work: one fewer parameter and
one fewer slice on the comma arm.
