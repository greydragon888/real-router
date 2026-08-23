---
"@real-router/core": patch
---

Snapshot `urlParamsEncoding` once at construction (#1839)

`createRouter`'s `urlParamsEncoding` option was handed downstream **by
reference**, so the engine coerced the caller's value again on every matcher
rebuild — `routes.add` / `remove` / `replace`, `setRootPath`, and the store
reset that `dispose()` goes through. Its sibling `queryParams` had been
snapshotted for exactly this reason; this one had not.

Two consequences, both reproduced before the fix:

- **A throwing `toString` could tear `dispose()` in half.** The rebuild happens
  after `sendDispose()`, so the throw escaped from the middle of teardown and
  left a router that still answered `buildPath` while its listeners had already
  been told it was gone.
- **The live encoding could drift.** A value that returned `"uri"` on the first
  read and `"none"` on a later one silently changed how subsequent URLs were
  escaped — the decoder along with them — with no navigation and no API call to
  account for it.

The value is now coerced once, in the constructor, and only the resulting key
travels. A coercion that throws now fails at construction with a `TypeError`
naming the option and carrying the original error as its `cause`, instead of
surfacing from an unrelated call later on.

One reported error changed, and it is recorded rather than left to be
discovered: the coercion now runs above route registration, so a config that is
bad in two places at once — a duplicate route name plus a throwing
`urlParamsEncoding`, say — reports the encoding fault where it previously
reported the other one. Construction failed either way.

The unit is one read per **router**, not one per value: `cloneRouter` builds a
new router from the base's raw options, so a per-request SSR clone still coerces
its own copy and a drifting value can still give a clone a different encoding
from its base. That face is deliberately out of scope here — closing it belongs
to `cloneRouter`, which would have to inherit the base's snapshotted key.
