---
"@real-router/hash-plugin": patch
---

Deduplicate `getLocation` callback into `buildHashLocation` helper (#506)

Extracted the hash-path-plus-query construction logic shared by the
production factory and two test helpers into a single pure function in
`hash-utils.ts`:

```ts
export function buildHashLocation(
  hash: string,
  search: string,
  prefixRegex: RegExp | null,
): string {
  const hashPath = safelyEncodePath(extractHashPath(hash, prefixRegex));
  return hashPath.includes("?") ? hashPath : hashPath + search;
}
```

Previously the same two-line sequence (strip prefix → encode → append
outer `search` unless hash already carries a `?`) was copied verbatim in
three places, with no structural guard against divergence:

- `packages/hash-plugin/src/factory.ts` — production `createSafeBrowser`
  callback.
- `packages/hash-plugin/tests/helpers/mockPlugins.ts` — functional-test
  mock browser.
- `packages/hash-plugin/tests/stress/helpers.ts` — stress-test router
  factory.

The "no double `?`" regression fixed in `url.test.ts` — "well-formed
path (no double '?')" was a direct consequence of the duplication: a
patch landed in production but the mocks fell behind until the test was
added. Consolidating into one helper prevents the class of regression.

Internal refactor only — no public API changes. `buildHashLocation` is
not exported from the package; it lives in `src/hash-utils.ts` alongside
the other hash-URL primitives.

Direct unit tests added in `tests/functional/hash-utils.test.ts` — 13
cases covering the "no double `?`" contract, the hashPrefix strip, URL
encoding of non-ASCII paths, malformed percent-sequence passthrough, and
composition agreement with `extractHashPath` / `hashUrlToPath`. The
regression previously surfaced only through an end-to-end router test
(`url.test.ts` — "well-formed path (no double '?')"); unit coverage now
pins the helper directly so future edits to `buildHashLocation` fail at
the helper level before they corrupt the router flow.
