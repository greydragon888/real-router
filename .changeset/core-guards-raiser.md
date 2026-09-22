---
"@real-router/core": patch
---

`guards.ts` builds its refusals through the raiser (#2487)

Internal refactor: the seventeen bracketed heads in that file are now written once
per door as a binding instead of once per throw inside a template. No message text
moves — the existing suite asserts every one of them verbatim.
