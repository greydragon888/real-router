---
"@real-router/vue": minor
---

Align duplicate `<RouteView.NotFound>` to first-wins, matching `<RouteView.Match>` / `<RouteView.Self>` and the React/Preact/Solid adapters (#1220). Previously, when multiple `<RouteView.NotFound>` siblings were declared in one `RouteView`, the **last** one rendered (`appendFallback` picked `.at(-1)`); now `recordFallback` stores the **first** NotFound VNode (`slots.notFoundVNode ??= child`) and it renders. Prefer a single `<RouteView.NotFound>` per `RouteView`.

Closes #1439.
