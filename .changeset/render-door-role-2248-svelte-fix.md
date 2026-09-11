---
"@real-router/svelte": patch
---

A rendered href no longer raises the commit-time param diagnostic (#2248)

With `@real-router/validation-plugin` installed, building an href for a route
carrying app-level data in `params` printed `reportUndeclaredParamKey` on every
first render of that route+key pair. That diagnostic is advice about a state you
are about to COMMIT — core records the discriminator as "a predicate commits
nothing", which is why `canNavigateTo` is silent despite sharing `navigate`'s
form. An href commits nothing either.

The render door now resolves the `forwardTo` chain through `forwardState` and
prints with `buildPath`, instead of asking the committing producer for a whole
`State` and keeping one string from it. Hrefs are unchanged — forwarding chains
of any length included — and the channel-correctness refusal added in #2250 is
untouched, since it lives on the same seam.
