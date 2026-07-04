---
"@real-router/svelte": minor
---

Event-delegate `createLinkAction` (`use:link`) — one shared listener pair per router instead of two per node (#1253)

- `use:link` now registers a single delegated `click` + `keydown` listener on `document` per router (a per-router singleton, ref-counted attach/detach), instead of attaching two listeners to every node. O(1) listeners for any number of links makes the recommended link-heavy path (nav menus, sitemaps, paginated lists) lighter at mount (~5.99 → ~4.3 ms per 1000 links, directional).
- **Behavior change (edge cases):** a descendant that calls `event.stopPropagation()` before the click reaches `document` now blocks navigation; and an element removed from the DOM without Svelte unmount (`element.remove()`) no longer navigates. Both are irrelevant under the normal `use:` lifecycle. `applyLinkA11y` stays per-node (it sets `role`/`tabindex`, not listeners).
