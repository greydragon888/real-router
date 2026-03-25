---
"@real-router/types": minor
---

Breaking: remove `noValidate` from `RouterOptions`

The `noValidate` field has been removed from the `RouterOptions` interface. Validation is now opt-in via `@real-router/validation-plugin` rather than opt-out via a router option.
