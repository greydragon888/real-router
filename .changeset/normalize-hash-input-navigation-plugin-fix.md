---
"@real-router/navigation-plugin": patch
---

Fix `normalizeHashInput` non-idempotence on multi-`#` input (#647)

`normalizeHashInput` in `shared/browser-env/url-context.ts` previously stripped only the FIRST leading `#`, so `normalize("##") === "#"` while `normalize("#") === ""` — calling it twice on `"##"` produced a different result. Property test G9 (`normalize(normalize(x)) === normalize(x)`) caught this under fast-check seed `-746842783` with counterexample `"##"`. Pre-existing since #532/#567; only surfaced now because the seed had not generated the corner case before.

`normalizeHashInput` now strips ALL leading `#` characters in a loop. Idempotence holds for every input.

**Behavioural change for navigation-plugin consumers**:

- `router.navigate(name, params, { hash: "##foo" })` previously produced fragment `"#foo"`; now produces `"foo"`.
- `router.buildUrl(name, params, { hash: "##foo" })` and `router.replaceHistoryState(name, params, { hash: "##foo" })` follow the same change.
- `<Link hash="##foo">` (via React/Preact/Vue/Solid/Svelte/Angular adapters) now resolves to fragment `"foo"`.

A monorepo grep confirmed zero production or example call sites pass `"##..."` as a hash value, so the behavioural change is empirically inert.

Updated G10 property test in `tests/property/hash-encoding.properties.ts` — previously documented the old single-strip behaviour, now asserts the new invariant ("ALL leading '#' chars are stripped — the result never starts with '#'"). G9 idempotence passes for all inputs.
