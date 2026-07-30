---
"@real-router/validation-plugin": patch
---

Accept and validate the new `defaultSearch` router option (#1548)

Without this the plugin rejects the option core just gained —
`Unknown option: "defaultSearch"` — so the two must ship together.

`validateDefaultParams` is generalised into `validateDefaultBag`, parameterised
by the option name and called once per channel, rather than copied: one rule for
both, so the two option channels cannot drift into accepting different shapes
for the same kind of value. The thrown message still names the option that was
actually wrong, which is pinned by a test.
