# browser-env Architecture

> Internal sources shared between `browser-plugin`, `hash-plugin`, and `navigation-plugin`.
> Physical location: [`shared/browser-env/`](../../shared/browser-env/). Each consumer
> exposes it under `src/browser-env/` via a **symlink**, which propagates edits instantly.
> Angular does **not** depend on browser-env — no tracked copy exists for this package.

## Source Structure

```
shared/browser-env/
├── detect.ts               — isBrowserEnvironment()
├── history-api.ts          — pushState, replaceState, addPopstateListener, getHash
├── plugin-utils.ts         — createStartInterceptor, createReplaceHistoryState, shouldReplaceHistory
├── popstate-handler.ts     — createPopstateHandler, createPopstateLifecycle
├── popstate-utils.ts       — getRouteFromEvent, updateBrowserState
├── safe-browser.ts         — createSafeBrowser
├── ssr-fallback.ts         — createWarnOnce, createHistoryFallbackBrowser
├── types.ts                — HistoryBrowser, Browser, SharedFactoryState
├── url-parsing.ts          — safeParseUrl
├── url-utils.ts            — extractPath, buildUrl, urlToPath
├── utils.ts                — normalizeBase, safelyEncodePath
├── validation.ts           — createOptionsValidator, safeBaseRule, nonNegativeIntegerRule
└── index.ts                — barrel
```

## Browser Interface

```ts
interface HistoryBrowser {
  pushState: (state: unknown, path: string) => void;
  replaceState: (state: unknown, path: string) => void;
  addPopstateListener: (fn: (evt: PopStateEvent) => void) => () => void;
  getHash: () => string;
}

interface Browser extends HistoryBrowser {
  getLocation: () => string;
}
```

- `createSafeBrowser(getLocation, ctx)` — real History API implementation (guards against SSR).
- `createHistoryFallbackBrowser(ctx)` — noop + warn-once for server environments.

## Popstate lifecycle

`createPopstateHandler` + `createPopstateLifecycle` serialize popstate processing via a
single-slot deferred-event queue. Only the **last** deferred event is kept — intermediate
states are skipped. Critical errors (anything that isn't a `RouterError`) trigger a
`replaceState` recovery that rolls the URL back to the router's current state.

`getRouteFromEvent(evt, api, browser)` tries `isState(evt.state)` first; on failure it
falls back to `api.matchPath(browser.getLocation())`. `updateBrowserState(state, url, replace, browser)`
writes `{ name, params, path }` — nothing else — into `history.state`.

## Pure URL utilities

- `normalizeBase(base)` — collapses `/+` to `/`, guarantees canonical form: empty or starts with `/`,
  no trailing `/`, no repeated `/`. Idempotent.
- `extractPath(pathname, base)` — strips `base` prefix when the match lies on a segment boundary.
  Guarantees a leading `/` (including `pathname === ""` → `"/"`).
- `buildUrl(path, base)` — joins `base + path`, inserting a separator when `path` lacks a leading `/`.
  Returns `base` unchanged when `path` is empty.
- `urlToPath(url, base)` — parses via `safeParseUrl`, returns `extractPath(pathname, base) + search`.
  Total — never returns null (scheme-agnostic parser handles any input).
- `safeParseUrl(url)` — manual scheme-agnostic parser, extracts `{ pathname, search, hash }` from
  any input (`http(s)://`, `app://`, `tauri://`, `file://`, path-relative, opaque). Total —
  never throws, never returns null. See
  [IMPLEMENTATION_NOTES#safeParseUrl](../../IMPLEMENTATION_NOTES.md#safeparseurl--scheme-agnostic-parser-496).
- `safelyEncodePath(path)` — `encodeURI(decodeURI(path))` with a try/catch for malformed
  percent-encoding; idempotent on already-well-encoded ASCII.

## Options validation

`createOptionsValidator(defaults, ctx, rules?)` performs per-key `typeof` checks against the
defaults and optionally delegates to rule-based validators:

- `safeBaseRule` — rejects control characters and `..` path segments.
- `nonNegativeIntegerRule` — `Number.isFinite` + `Number.isInteger` + `>= 0`.

Consumers (`browser-plugin`, `hash-plugin`, `navigation-plugin`) pass `{ base: safeBaseRule }`.

## Testing

`packages/browser-env/` is a private workspace entry whose `src/` is a symlink to this tree.
It owns **unit** and **property** tests for every pure function listed above. Editing a
file in `shared/browser-env/` instantly updates the test source tree.

| Suite | Purpose |
|---|---|
| `tests/unit/utils.test.ts` | `normalizeBase`, `safelyEncodePath` |
| `tests/unit/url-utils.test.ts` | `extractPath`, `buildUrl`, `urlToPath` |
| `tests/unit/plugin-utils.test.ts` | `createReplaceHistoryState`, `shouldReplaceHistory` |
| `tests/unit/history-api.test.ts` | `pushState`, `replaceState`, `getHash` |
| `tests/unit/ssr-fallback.test.ts` | SSR noop browser + warn-once |
| `tests/unit/detect.test.ts` | `isBrowserEnvironment` |
| `tests/unit/validation.test.ts` | `createOptionsValidator` + rules |
| `tests/property/browserEnv.properties.ts` | idempotency, canonical form, roundtrip, total functions |
| `tests/property/shouldReplaceHistory.properties.ts` | truth-table + G4 domain completeness |
| `tests/property/validation.properties.ts` | rule-based validator behavior |
