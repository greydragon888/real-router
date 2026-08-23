---
"@real-router/core": patch
---

Read `urlParamsEncoding` once, at construction (#1839)

**Who is affected:** only callers whose `urlParamsEncoding` is not a plain
string — an object with a `toString` or `Symbol.toPrimitive`, which needs a cast
in TypeScript but is ordinary in JavaScript or in a config assembled at runtime.
The four documented values and omitting the option are unaffected; nothing about
them changed.

For such a value, the router used to re-read it every time the matcher was
rebuilt — `routes.add` / `remove` / `replace` / `clear`, `setRootPath`, and the
store reset `dispose()` goes through. Navigation never re-read it, so a router
that only navigates was never affected either.

Three consequences, all reproduced before the fix:

- **`dispose()` could tear in half.** The rebuild happens after listeners have
  been told the router is gone, so a `toString` that threw there left the routes
  uncleared: the disposed router still answered `buildPath()`, and every retry
  hit the idempotency early-return and reported success.
- **Route CRUD could fail outright.** `routes.add` and `setRootPath` threw and
  did not apply.
- **The live encoding could drift.** A value answering `"uri"` on one read and
  `"none"` on the next silently changed how subsequent URLs were escaped, and
  how they were decoded, with no API call to account for it.

The value is now coerced once, in the constructor, and only the resulting key
travels.

**Two behaviour changes worth knowing about:**

- A coercion that throws now fails with `TypeError: [router.constructor] Invalid
"urlParamsEncoding": coercing it threw.`, carrying the original error as
  `cause`. Previously the caller's own error escaped unwrapped. If you match on
  the error's class or message, that changed.
- When a config is bad in two places at once, the encoding fault is now reported
  first, where a duplicate route name or an invalid `queryParams.arrayFormat`
  would previously have won.
