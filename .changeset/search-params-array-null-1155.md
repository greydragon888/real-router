---
"@real-router/core": patch
---

Fix `search-params` `parse`→`build` inverse-pair crash: null array elements now round-trip instead of throwing (#1155)

`parse` produced `null` array elements (a key-only chunk on a repeated/bracketed key: `parse("a&a=1")` → `{a:[null,1]}`) that `build`'s `encodeArray` rejected with a raw `TypeError`. Because core glues `parse`→`build` on every match (`rewritePathOnMatch` + `queryParamsMode: "loose"`), an external URL like `/x?a&a=1` crashed `router.start()` with an unhandled `TypeError` (SSR 500, single-request, unauthenticated).

Fix (encode side — close the domains): a `null` array element now encodes to the same wire token a scalar null does, per array format — the bare key under `nullFormat: "default"` (`none`→`name`, `brackets`→`name[]`, `index`→`name[i]`), dropped under `nullFormat: "hidden"`. `comma` has no per-element bare form, so a null element (reachable only via a bracketed chunk under comma config) is dropped. `range(parse) ⊆ dom(build)` now holds.

The blind zone that let three audit waves + #1037 miss this is closed by construction: a new grammar-first property (`tests/property/inversePair.properties.ts`) generates query strings from the wire grammar (key-only / repeats / brackets / empty chunks), not from `build`, and asserts `build(parse(qs))` never throws over the full option matrix.
