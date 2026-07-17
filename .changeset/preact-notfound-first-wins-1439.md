---
"@real-router/preact": minor
---

Align duplicate `<RouteView.NotFound>` to first-wins, matching `<RouteView.Match>` / `<RouteView.Self>` and the React adapter (#1220). Previously, when multiple `<RouteView.NotFound>` siblings were declared in one `RouteView`, the **last** one rendered; now the **first** does — `assignFallbackSlot` guards the slot with a `notFoundFound` flag (the twin of `selfFound`). Prefer a single `<RouteView.NotFound>` per `RouteView`.

Closes #1439.
