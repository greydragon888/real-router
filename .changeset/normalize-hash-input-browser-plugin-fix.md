---
"@real-router/browser-plugin": patch
---

Fix `normalizeHashInput` non-idempotence on multi-`#` input (#647)

`normalizeHashInput` in `shared/browser-env/url-context.ts` previously stripped only the FIRST leading `#`, so `normalize("##") === "#"` while `normalize("#") === ""` — calling it twice on `"##"` produced a different result. Property test G9 (`normalize(normalize(x)) === normalize(x)`) in the navigation-plugin's property suite caught this under fast-check seed `-746842783` with counterexample `"##"`. Pre-existing since #532/#567.

`normalizeHashInput` now strips ALL leading `#` characters in a loop. Idempotence holds for every input.

**Behavioural change for browser-plugin consumers**:

- `router.navigate(name, params, { hash: "##foo" })` previously produced fragment `"#foo"`; now produces `"foo"`.
- `router.buildUrl(name, params, { hash: "##foo" })` and `router.replaceHistoryState(name, params, { hash: "##foo" })` follow the same change.
- `<Link hash="##foo">` (via React/Preact/Vue/Solid/Svelte/Angular adapters) now resolves to fragment `"foo"`.

A monorepo grep confirmed zero production or example call sites pass `"##..."` as a hash value, so the behavioural change is empirically inert.

The helper lives in `shared/browser-env` (consumed by both URL plugins via symlink); the fix and behavioural change apply identically to `@real-router/navigation-plugin`.
