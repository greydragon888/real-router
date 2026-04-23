# React + `@real-router/navigation-plugin`

Web example demonstrates **9 exclusive extensions** of `navigation-plugin` across 5 UX scenarios that are impossible to implement on the History API alone.

## What this example shows

1. **Smart Back / Forward buttons** — `peekBack`, `peekForward`, `canGoBack`, `canGoForward`. Buttons show the destination route name and disappear when the stack is empty, so the user knows exactly where each arrow leads.
2. **Visit tracking (onboarding)** — `hasVisited`, `getVisitedRoutes`, `getRouteVisitCount`. Sidebar shows `NEW` / `✓ ×N` badges next to each link plus a progress bar "Explored: X / 6 routes".
3. **Return to last visit** — `canGoBackTo`, `traverseToLast`. On a product detail or edit page, a contextual "← Return to Products list" banner jumps straight back to the last products list entry, skipping intermediate history records.
4. **Direction-aware animations** — `state.context.navigation.direction`. Forward navigation slides from the right, Back slides from the left, `replace`/`reload` fade.
5. **History-aware guard** — `state.context.navigation.userInitiated`. On the product edit page a `canDeactivate` guard shows a confirm dialog **only** when the user hit browser Back — programmatic navigation (Link clicks, a Save button) passes through silently.

## Browser support

`navigation-plugin` requires the [Navigation API](https://caniuse.com/mdn-api_navigation) (~89% support as of 2026).

| Browser | Status |
| ------- | ------ |
| Chrome ≥ 102 | ✅ |
| Edge ≥ 102 | ✅ |
| Opera ≥ 88 | ✅ |
| Firefox | ❌ not yet |
| Safari | ❌ not yet |

The example includes a feature-detection screen for unsupported browsers. In a real application you would typically fall back to `@real-router/browser-plugin` — this example deliberately uses a strict "requires Navigation API" banner to avoid masking the exclusive extensions being demonstrated.

## Feature-detection pattern

```ts
if (!("navigation" in globalThis)) {
  // render fallback UI
} else {
  const router = createRouter(routes, { defaultRoute: "home", allowNotFound: true });
  router.usePlugin(navigationPluginFactory());
  await router.start();
  // mount React as usual
}
```

## Running

```bash
pnpm install
pnpm dev          # http://localhost:5173
pnpm build        # tsc -b && vite build → dist/
pnpm preview      # http://localhost:4173
pnpm test:e2e     # Playwright (Chromium-only — Navigation API required)
```

## Related examples

- [`examples/electron/react-navigation`](../../electron/react-navigation) — same plugin in Electron with custom `app://` protocol.
- [`examples/tauri/react-navigation`](../../tauri/react-navigation) — same plugin in Tauri v2 with OS-version caveats.
- [`examples/react/basic`](../basic) — baseline with `browser-plugin` (no Navigation API).
