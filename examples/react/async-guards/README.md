# React Async Guards Example

Demonstrates async route guards with progress bar and AbortController cancellation.

## What it covers

- `canActivate` returning `Promise<boolean>` — 500ms cart check on `/checkout`
- `canDeactivate` returning `Promise<boolean>` — confirm dialog on `/editor` when unsaved
- `useRouterTransition()` — progress bar during async guard execution
- AbortController cancellation — second navigation auto-aborts the first in-flight guard

## Run

```bash
pnpm install
pnpm dev
```
