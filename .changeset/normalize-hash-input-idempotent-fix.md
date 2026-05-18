---
"@real-router/navigation-plugin": patch
"@real-router/browser-plugin": patch
---

Fix `normalizeHashInput` non-idempotence on multi-`#` input (#647)

`normalizeHashInput` in `shared/browser-env/url-context.ts` previously stripped only the FIRST leading `#`, so `normalize("##") === "#"` while `normalize("#") === ""` — calling it twice on `"##"` produced a different result. Property test G9 (`normalize(normalize(x)) === normalize(x)`) caught this under fast-check seed `-746842783` with counterexample `"##"`. Pre-existing since #532/#567; only surfaced now because the seed had not generated the corner case before.

`normalizeHashInput` now strips ALL leading `#` characters in a loop. Idempotence holds for every input.

**Behavioural change** (user-observable surface):

- `router.navigate(name, params, { hash: "##foo" })` previously produced fragment `"#foo"`; now produces `"foo"`.
- `router.buildUrl(name, params, { hash: "##foo" })` and `router.replaceHistoryState(name, params, { hash: "##foo" })` follow the same change.
- `<Link hash="##foo">` (across all 6 adapters) now resolves to fragment `"foo"`.

The docstring already promised "we accept both `section` and `#section` gracefully"; multi-`#` was an undocumented corner case. A monorepo grep confirmed zero production or example call sites pass `"##..."` as a hash value, so the behavioural change is empirically inert.

Updated G10 property test in `packages/navigation-plugin/tests/property/hash-encoding.properties.ts` — previously documented the old single-strip behaviour ("only the FIRST leading '#' is stripped — second one is preserved"), now asserts the new invariant ("ALL leading '#' chars are stripped — the result never starts with '#'"). G9 idempotence passes for all inputs.

Both URL plugins (`@real-router/browser-plugin`, `@real-router/navigation-plugin`) consume the helper via the `shared/browser-env` symlink, so both ship the patch.
