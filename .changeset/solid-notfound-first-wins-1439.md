---
"@real-router/solid": minor
---

Align duplicate `<RouteView.NotFound>` to first-wins, matching `<RouteView.Match>` / `<RouteView.Self>` and the React/Preact/Vue adapters (#1220). Previously, when multiple `<RouteView.NotFound>` markers were present in one `RouteView`, the **last** one rendered (`pickWinner` reassigned `notFoundMarker` on each); now the **first** wins (`notFoundMarker ??= child`). Prefer a single `<RouteView.NotFound>` per `RouteView`.

Closes #1439.
