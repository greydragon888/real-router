/**
 * Option defaults shared by the URL-owning plugins — `browser-plugin`,
 * `hash-plugin` and `navigation-plugin`.
 *
 * What belongs here: an option that describes **router behaviour**, where all
 * three plugins must give the same answer because the user is asking one
 * question about their app, not about a URL encoding. URL mechanics
 * (`hashPrefix`) and identifiers (`source`, `LOGGER_CONTEXT`) stay with each
 * plugin — they differ by construction.
 *
 * `forceDeactivate: false` — browser back/forward consults `canDeactivate`
 * guards, exactly like `router.navigate()` does. A deliberate bypass stays
 * available per plugin via `forceDeactivate: true`.
 *
 * The value lives in one place because the three copies it replaces had already
 * drifted, and the drift reached users: #524 flipped the default in
 * `navigation-plugin` alone, on the stated premise that confirm-on-back already
 * worked under `browser-plugin` — measured false in #1645, where the guard was
 * called ZERO times on a matched back/forward. Since #1643 the not-found arm of
 * the SAME gesture did consult the guard, so one option gave the two halves of
 * one Back press opposite answers. The option's type has always been shared
 * (`PopstateTransitionOptions.forceDeactivate`); now its value is too (#1651).
 */
export const sharedUrlPluginDefaults = {
  forceDeactivate: false,
  base: "",
} as const;
