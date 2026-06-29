---
"@real-router/core": patch
---

Restore always-on (bare-core) route-name hardening parity across the mutating CRUD ops (#1047). `add` rejected reserved `@@`-prefixed names (#954) and in-batch duplicate paths (#955) without the validation-plugin, but `replace` only rejected duplicate names (reserved-name + dup-path were plugin-only) and `remove`/`update` accepted reserved `@@` names entirely (a regression of #238, which originally protected all four mutators before the validation-extraction demoted the checks to the opt-in plugin). Bare core now rejects these on `replace`/`remove`/`update` too — with the same error messages as the validation-plugin — closing silent-shadow (`replace` dup-path) and reserved-name-mutation gaps. The `replace` guards run before the build/swap, so a rejected batch leaves the existing tree intact.
