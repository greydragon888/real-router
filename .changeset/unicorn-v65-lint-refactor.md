---
---

Internal refactor only — no release (#712).

Re-enabled 7 `eslint-plugin-unicorn` v65 recommended rules by migrating source
to satisfy them (`prefer-set-has`, `no-array-from-fill`,
`no-array-fill-with-reference-type`, `no-this-outside-of-class`,
`prefer-array-some`, et al.) and disabled `require-css-escape` with
justification. The shipped-source edits (`Set.has()` over array `.includes()`,
named-const returns over `return this`) are behavior-neutral: no public API,
runtime, or type change. Intentionally empty so no package version is bumped.
