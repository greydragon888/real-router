---
"@real-router/hash-plugin": minor
---

`forceDeactivate` now defaults to `false` — back/forward respects `canDeactivate` (#1645)

Same change, same reason as `@real-router/browser-plugin`: the two share the
popstate handler but each shipped its own default, and both shipped `true` from
their first release. A `canDeactivate` guard — the mechanism an app uses to stop a
departure that would lose unsaved work — was therefore never asked when the user
pressed Back.

#524 decided this question ("stop making the bypass the default, keep the option as
a deliberate escape hatch") and applied it to `navigation-plugin` alone, on the
premise that the other two already behaved that way. Measured: they did not.

After this change all four back/forward surfaces in the project agree —
`browser-plugin`, `hash-plugin`, `navigation-plugin` and `memory-plugin` (which
never had the option and always consulted guards).

**Migration.** To keep the old behaviour, pass the option explicitly:

```ts
router.usePlugin(hashPluginFactory({ forceDeactivate: true }));
```
