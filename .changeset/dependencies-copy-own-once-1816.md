---
"@real-router/core": patch
---

fix(core): the dependencies copy loops read each key twice and stored the second (#1816)

Both doors — the constructor's initial deps and `setAll` — tested
`deps[key] !== undefined` and then read the same key again for the value they
stored. Two reads of an object the caller owns, so a key was ADMITTED on one value
and STORED with another.

```
a Proxy over a plain object, own data property
  before  reads 2, stored "read#2"
  after   reads 1, stored "read#1"
```

⚠ Inheritance is not required, which is what separates this from #1799 / #1823: a
Proxy with an own data property passes `guardDependencies` — there is no accessor
descriptor to find — and the loop still read it twice. The row `setAll · deps` in
`read-count-authority.test.ts` moves from 2 to 1, and from the "known defect"
block into the "1 read" block.
