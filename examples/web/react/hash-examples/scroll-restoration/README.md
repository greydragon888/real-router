# Real-Router — Scroll Restoration Example

> Dedicated React-only example exercising every behavioral branch of `createScrollRestoration` (#497). Covers all three modes (`restore` / `top` / `native`), all three behavior values (`auto` / `instant` / `smooth`), all four `navigationType` values (`push` / `replace` / `traverse` / `reload`), anchor scrolling (4 entry points after #531/#532), custom `scrollContainer`, and `pagehide` save + F5 restore.

## Quick start

```bash
pnpm bundle                                            # rebuild shared/dom-utils dist
pnpm -F react-scroll-restoration-example dev           # http://localhost:5173
pnpm -F react-scroll-restoration-example build         # tsc -b + vite build
pnpm -F react-scroll-restoration-example test:e2e      # 13 tests / 7 describe blocks
```

The floating **Scroll Meter** in the bottom-right corner shows live `scrollY`, the published `state.context.navigation` direction / navigationType, and the `sessionStorage` scroll-restore store keyed by `state.name + ":" + canonicalJson({ ...state.params, ...state.search })`. Stable Playwright selectors live on `[data-testid="scroll-meter"]` (with `data-scroll-y` attribute for rAF-stable reads) and per-route `[data-testid="nav-*"]`.

## Why not a plugin

`createScrollRestoration` lives in `shared/dom-utils/`, not as a `@real-router/scroll-plugin`. Reasons:

- Router-core is DOM-agnostic — `window.scrollY` is a DOM concern.
- All routing-layer inputs the utility needs (`direction`, `navigationType`) are already published by `navigation-plugin` via `state.context.navigation`. A plugin would duplicate an existing channel without adding value.
- Symmetric to `createRouteAnnouncer` — both are framework-agnostic DOM helpers wired into `RouterProvider` per adapter.

See [Wiki › Scroll Restoration](https://github.com/greydragon888/real-router/wiki/Scroll-Restoration) for the full architectural rationale.

## Behavior matrix

| Event                                                       | mode: "restore"                          | mode: "top"               | mode: "native"     |
| ----------------------------------------------------------- | ---------------------------------------- | ------------------------- | ------------------ |
| forward push на новый path (`<Link>` без `hash`)            | top                                      | top                       | браузерный дефолт  |
| forward push с `<Link hash>` cross-path¹                    | scroll к anchor (hash сохранён в URL)    | scroll к anchor           | браузерный дефолт  |
| same-path `<Link hash>` (anchor click)¹                     | scroll к anchor (auto-force, transition) | scroll к anchor           | браузерный дефолт  |
| back / forward (traverse)                                   | restore                                  | top                       | браузерный дефолт  |
| programmatic replace (`navigate(..., { replace: true })`)   | no-op                                    | top                       | браузерный дефолт  |
| programmatic reload (`navigate(..., { reload: true })`)     | restore                                  | top или anchor            | браузерный дефолт  |
| **F5 / `page.reload()` (cross-document) после #531**        | **save + restore работают²**             | top или anchor на initial | браузерный дефолт  |
| initial goto с hash (`goto('/p#a')`)                        | scroll к anchor (после #531 priming)     | scroll к anchor           | браузерный дефолт  |

> Note: `native` mode означает «утилита **отключена**, browser handles restore natively». Это противоположность DOM-значению `history.scrollRestoration === "manual"` — там browser НЕ восстанавливает, и app должно делать сам. Утилита в `native` mode не трогает `history.scrollRestoration`, оно остаётся `"auto"`, и браузер делает restore через свой built-in mechanism.

¹ After #532 hash is stored decoded in `state.context.url.hash`; tri-state `opts.hash`: `undefined` preserves, `""` clears, value sets. Same-path `<Link hash>` auto-bypasses `SAME_STATES` via `navigateWithHash` (adds `force: true, hashChange: true`).

² After #531 navigation-plugin reads `navigation.activation.navigationType` via `browser.getActivationType()` on initial load and primes `state.context.navigation.navigationType = "reload"` for F5. The utility takes the restore branch and writes saved scrollY back from `sessionStorage`.

## Scenarios (7 base, 13 tests with sub-tests)

| #   | Scenario               | Sub-tests | What it exercises                                                          |
| --- | ---------------------- | --------- | -------------------------------------------------------------------------- |
| 1   | Restore on back        | —         | `direction === "back"` → `writePos(loadStore()[keyOf(route)])`             |
| 2   | Top on forward push    | —         | `default` branch → `scrollToHashOrTop` → `writePos(0)`                     |
| 3   | Anchor scrolling       | 4 (a/b/c/d) | initial goto / cross-path `<Link hash>` / same-path auto-force / cyrillic |
| 4   | Replace no-op          | —         | `navigationType === "replace"` early return; store key under previousRoute |
| 5   | Mode + behavior toggle | 12 (a-l)  | top scroll-to-top on Back / native UI persistence / top replace→top / top F5→top / native scrollRestoration=auto / native no store writes / behavior=smooth → scrollTo / native: Chromium native restore on Back / **5i** cross-path hash with no matching id → scroll=0 / **5j** same-path hash with no matching id → scroll=0 / **5k** behavior=smooth → scrollIntoView / **5l** active link no-op (SAME_STATES) |
| 6   | Custom `scrollContainer` | 2       | virtual-scroller save+restore / **6b** null fallback to window across routes (multi-route flow) |
| 7   | F5 persistence         | 3 (a/b/c) | save via `pagehide`, F5 restore via #531 priming, programmatic reload      |

## Plugin dependencies

| Plugin            | In example | Alternative    | Effect of substitution                                                                                                                                                                        |
| ----------------- | ---------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| navigation-plugin | yes        | browser-plugin | browser-plugin does not publish `state.context.navigation` → utility degrades to top semantics (`!nav → scrollToHashOrTop` branch); scenarios **1, 4, 7b, 7c** stop working. Scenario 5 and 7a are plugin-agnostic. |

navigation-plugin and browser-plugin are **interchangeable** (not complementary) URL-navigation sources. We pick navigation-plugin because only it publishes `direction` and `navigationType`. Scenarios 5 (mode toggle) and 7a (`pagehide` save) are plugin-agnostic.

## Out of scope

- **SSR + hydration** — covered by `examples/web/react/ssr-examples/ssr/` and `ssr-examples/ssg/`. The utility is a no-op in SSR (`typeof window === "undefined"` early-return).
- **Keep-alive virtual lists** — not part of #497.
- **Multiple nested `scrollContainer`** — not supported by the utility (one container per RouterProvider).
- **Other 5 framework adapters** — basic opt-in is already in `examples/web/{preact,solid,vue,svelte,angular}/basic/`; syntax differs only by template form. Wiki has copy-paste blocks for all 6 adapters.
- **View Transitions API** — separate concern (#498).

## Implementation notes

- **Scroll measurement tolerance** — Playwright reads scrollY through `[data-testid="scroll-meter"][data-scroll-y]`. rAF jitter and hi-DPI rounding make ±20px the safe tolerance; `expect.poll(...).toSatisfy(y => Math.abs(y - target) < 20)` is the pattern. `toBeCloseTo(val, -1)` only gives ±5 — too tight.
- **Mode switching reload** — sense: utility is constructed once on RouterProvider mount; hot-swap is not supported. Mode is persisted in `localStorage["scroll-restoration-mode"]`, applied on next mount. Documented UX quirk: switching with non-zero scroll on `/settings` may "jump" to a saved position after reload (the utility's `restore` branch writePos's the previously-captured `settings:{}` key).
- **Custom scrollContainer applies globally** — `scrollContainer: () => document.getElementById("virtual-scroller")` returns `null` on routes without that element. `readPos` / `writePos` lazy-resolve and fall back to `window`. Demonstrated as a feature on Scenario 6.
- **`pagehide` save edge-case** — save runs in `pagehide` listener which fires on tab close / reload / cross-document navigate. Within one document, between routes, save runs through `router.subscribe(({ previousRoute }) => putPos(...))`. Edge case: navigating away from `/gallery`, the Gallery component unmounts before the subscribe callback's `readPos()` runs → `getContainer()` returns `null` → falls back to `window.scrollY` (=0 on the freshly-mounted next route). Acceptable trade-off for an example; documented in the plan.
