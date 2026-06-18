---
"@real-router/core": patch
---

Fix `arrayFormat: "index"` ignoring the bracket index when parsing (#856)

`parse` accumulated bracketed elements in insertion order and ignored the numeric
index in `a[n]`, so an out-of-order indexed query was returned in arrival order:

- `parse("a[2]=z&a[0]=x&a[1]=y", { arrayFormat: "index" })` → `{ a: ["z","x","y"] }`
  (now `{ a: ["x","y","z"] }`)

`parse` now orders index-format elements by their bracket index. Indices are sorted
and the array is compacted, so a huge index (`a[1000000]`) does not allocate a
sparse array; non-numeric/empty brackets (`a[]`, `a[x]`) fall back to insertion
order. `build → parse` is unchanged (build already emits indices in order).
