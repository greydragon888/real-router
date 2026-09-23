---
"@real-router/validation-plugin": patch
---

Every bracketed refusal builds through the raiser (#2487)

Step 7, the largest family: 108 sites in 12 files write their message head once as a
binding instead of spelling it at each construction. No message text moves — measured
against `origin/master`, body by body with the head stripped, not assumed.

One observable change. The `[internal]` head on `collectPathsToRoute`'s not-found
throw becomes `Internal error (please report): …`: no caller input reaches it, which
is the shape O-1 gives a marker rather than a bracketed name. The
`UNREACHABLE_BY_CONSTRUCTION` register held that one entry and retires with it.
