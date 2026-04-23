# React keepAlive Example

Demonstrates `RouteView.Match keepAlive` — React 19.2+ Activity API for preserving component state across navigations.

## What it covers

- `<RouteView.Match keepAlive>` — keeps component mounted in `Activity mode="hidden"` when inactive
- Side-by-side comparison: Dashboard (keepAlive) vs Settings (no keepAlive)
- Search input value and scroll position preserved on Dashboard after navigating away and back
- Settings form resets on every visit (standard unmount behaviour)

## Scenario

1. Go to **Dashboard** — type in the search box, scroll the table down
2. Navigate to **Settings** — type in the form
3. Navigate back to **Dashboard** — search value and scroll position are preserved
4. Navigate to **Settings** again — form is empty (reset on unmount)

## Requirements

React 19.2+ (React Activity API). For React 18, use `@real-router/react/legacy` — no `RouteView`, manual routing via `useRouteNode` + switch/case.

## Structure

```
src/
  main.tsx          ← creates router, mounts app
  App.tsx           ← RouteView with keepAlive on Dashboard
  routes.ts         ← route definitions
  pages/
    Home.tsx        ← intro with navigation hints
    Dashboard.tsx   ← search input + scrollable table (keepAlive)
    Settings.tsx    ← form that resets on every visit (no keepAlive)
../shared/
  Layout.tsx        ← shared shell
../../shared/
  styles.css        ← shared CSS
```

## Run

```bash
pnpm install
pnpm dev
```

## Build

```bash
pnpm build
```
