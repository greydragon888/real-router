---
"@real-router/validation-plugin": patch
---

The resolved-`defaultRoute` refusal names the door when a call reached it (#1845)

One validator served two arrival paths, and a single prefix could only be right for
one of them. Its own docblock named both: the retrospective sweep, with
`options.defaultRoute` configured as a **string**, and the runtime pass on every
`navigateToDefault()`, with a **callback**'s return value. The two are mutually
exclusive on the option's type.

So it is two functions now, each owning a literal head — no prefix travels as data:

```diff
  // the retrospective sweep: no call reaches it, the package name is the address
  [validation-plugin] defaultRoute resolved to non-existent route: "ghost"

  // reached from navigateToDefault() alone, and it arrives as a REJECTION
- [validation-plugin] defaultRoute resolved to non-existent route: "ghost"
+ [router.navigateToDefault] defaultRoute callback resolved to non-existent route: "ghost"
```

⚑ The runtime path's reachability was already pinned — an integration cell drives
`navigateToDefault()` and awaits a rejection — so the door was demonstrable before
it was named. That cell now asserts the door as well as the body, and the unit
tests cover both functions rather than one.

⚠ An assertion matching the old message on the callback path needs the new text;
the string path is unchanged.
