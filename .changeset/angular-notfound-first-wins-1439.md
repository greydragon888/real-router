---
"@real-router/angular": minor
---

Align duplicate `routeNotFound` templates to first-wins, matching `routeMatch` / `routeSelf` and the React/Preact/Solid/Vue adapters (#1220). Previously, when multiple `<ng-template routeNotFound>` markers were projected into one `<route-view>`, the **last** one rendered (`notFounds().at(-1)`); now the **first** does (`notFounds().at(0)`).

This removes the previously-documented ability to override an inherited `routeNotFound` template by re-declaring it lower in the projected content — prefer a single `routeNotFound` per `<route-view>`.

Closes #1439.
