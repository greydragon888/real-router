---
"@real-router/svelte": minor
---

Add opt-in scroll restoration via `RouterProvider.scrollRestoration` (#497)

New `scrollRestoration?: ScrollRestorationOptions` prop on `RouterProvider`. Restores scroll position on back navigation, scrolls to top or hash on push. Supports `manual` / `top` / `restore` modes and a custom scroll container.

```svelte
<RouterProvider {router} scrollRestoration={{ mode: "restore" }}>
  <!-- ... -->
</RouterProvider>
```

Backed by the shared `createScrollRestoration` utility in `shared/dom-utils` — same pattern as `createRouteAnnouncer`. Direction is read from `@real-router/navigation-plugin`'s `state.context.navigation`; position is persisted across reloads via `sessionStorage` + `pagehide`.
