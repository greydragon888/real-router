---
"@real-router/browser-plugin": minor
---

`forceDeactivate` now defaults to `false` — back/forward respects `canDeactivate` (#1645)

A `canDeactivate` guard is how an app stops a departure that would lose data. Under
this plugin's shipped default it was never asked on browser back/forward: press
Back with unsaved changes and the confirm dialog the app registered simply did not
appear.

This is the decision #524 already made and applied to only one of the three URL
plugins. Its reasoning — "stop making the bypass the default, keep the option as a
deliberate escape hatch" — was written against the premise that the same user code
already worked here. Measured through the real popstate handler, it did not: the
guard was called **zero** times on a back/forward to a matched URL, and the default
had been `true` since v0.1.0. Nothing caught the drift because nothing pinned it —
flipping the default broke none of the 356 tests in this package.

Two things made it visible now. `navigation-plugin`'s own README says its default
"matches browser-plugin", which this plugin's README contradicted on the next page.
And since #1643 the OTHER half of the same gesture — Back to a URL that no longer
matches any route — does consult the guard, so one option gave the two halves of
one back button opposite answers.

**Migration.** If your app relies on browser back/forward committing regardless of
guards (e.g. to avoid a dead-end where the user cannot leave), pass the option
explicitly:

```ts
router.usePlugin(browserPluginFactory({ forceDeactivate: true }));
```

Nothing else changes: the option, its type and its semantics are untouched — only
which value you get when you do not pass one.
