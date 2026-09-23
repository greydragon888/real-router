---
"@real-router/core": patch
---

Twenty-three more refusals build through the raiser (#2487)

Internal refactor across seven core files. Two local duplicates of the raiser's own
job go with them: `route-name.ts`'s `head()` helper, which re-implemented the bare-head
rule, and the head format inside `routes.ts`'s `createRouterError` factory — its ten
call sites are untouched, since the door arrives there as an argument.
