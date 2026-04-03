---
"@real-router/vue": minor
---

Add per-Match `keepAlive` support to `RouteView` (#391)

`<RouteView.Match>` now accepts an optional `keepAlive` prop for granular control over which routes preserve state. Previously, `keepAlive` was only available on the root `<RouteView>` (all-or-nothing). Per-Match keepAlive uses a persistent `<KeepAlive>` instance with wrapper components to maintain Vue's cache across navigations.

```vue
<RouteView nodeName="">
  <RouteView.Match segment="dashboard" keepAlive>
    <Dashboard />  <!-- State preserved -->
  </RouteView.Match>
  <RouteView.Match segment="settings">
    <Settings />  <!-- Unmounts normally -->
  </RouteView.Match>
</RouteView>
```

Root-level `<RouteView keepAlive>` behavior is unchanged.
