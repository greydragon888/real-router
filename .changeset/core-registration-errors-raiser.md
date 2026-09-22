---
"@real-router/core": patch
---

Registration errors build through the raiser (#2487)

Internal refactor: the twelve refusals in
`engine/path-matcher/registration/errors.ts` are written once as a binding instead
of once per throw inside a template. No message text moves — the existing suite
asserts every one of them verbatim.
