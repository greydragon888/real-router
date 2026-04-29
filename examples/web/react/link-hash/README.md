# `<Link hash>` — Tab UI Demo

Dogfood for issue [#532 — URL fragment ("hash") support in URL plugins](https://github.com/greydragon888/real-router/issues/532).

This example demonstrates **tab-style UI driven by `state.context.url.hash`** —
URL fragment as bookmarkable tab state, with no scroll-restoration involvement.
For anchor-link scrolling and `scrollIntoView` behavior see the
`scroll-restoration` example (issue #534).

## Run

```bash
pnpm install
pnpm bundle                                 # rebuild shared/dom-utils dist
pnpm -F react-link-hash-example dev
```

Then open <http://localhost:5173>.

## What it shows

| API | Demonstrated by | Source |
|-----|---|---|
| `<Link hash="profile">` | Tab navigation in `Settings` page | `src/pages/Settings.tsx` |
| `state.context.url.hash` | Active tab read from router state, not React local state | `src/pages/Settings.tsx` |
| Auto-force on same-route different-hash | Clicking `<Link hash="account">` while at `/settings#profile` updates URL and re-publishes the namespace (would otherwise be SAME_STATES) | `navigateWithHash` helper in `shared/dom-utils/link-utils.ts` |
| Tri-state `opts.hash` | Three buttons in `HashControls`: set / clear / preserve | `src/pages/HashControls.tsx` |
| Cross-path preserve | `<Link routeName="dashboard">` (no `hash` prop) keeps the current fragment | `Dashboard` page reads `state.context.url.hash` |
| F5 priming | Refresh `/settings#account` keeps the active tab "account" | Plugin constructor reads `getDecodedHash(browser)` |
| Hash-plugin warn-once | Append `?plugin=hash` and the example switches to `@real-router/hash-plugin`. Console emits one `[@real-router/hash-plugin] hash option is ignored …` warning regardless of how many `<Link hash>` clicks happen | `src/main.tsx` plugin selector |

## Plugin selector

The example bundles **both** `@real-router/browser-plugin` and
`@real-router/hash-plugin` and selects one at startup:

- **Default**: `browser-plugin`. URLs look like `/settings#profile`.
  `state.context.url` is populated, `<Link hash>` works end-to-end.
- **`?plugin=hash`**: `hash-plugin`. URLs look like
  `/index.html#!/settings`. `<Link hash>` is silently ignored at runtime; a
  one-time `console.warn` documents the limitation.

This is the documented limitation from #532: hash-plugin uses `#` as the route
delimiter, so URL fragments are structurally incompatible. Use `browser-plugin`
or `navigation-plugin` for fragment support.

## E2E tests

```bash
pnpm -F react-link-hash-example test:e2e
```

Five scenarios:

1. Tab switching updates the URL hash without scroll jumps.
2. F5 priming preserves the active tab.
3. Cross-path navigation preserves the current hash.
4. `opts.hash = ""` explicitly clears the fragment.
5. `?plugin=hash` emits exactly one warn-once, regardless of click count.

## See also

- [issue #532](https://github.com/greydragon888/real-router/issues/532) — design
- [Wiki: Hash](https://github.com/greydragon888/real-router/wiki/Hash) — full API reference (after Stage 4)
- `examples/web/react/scroll-restoration/` — anchor scrolling demo (issue #534)
- `examples/web/react/hash-routing/` — page-level routing via `hash-plugin` (different feature)
