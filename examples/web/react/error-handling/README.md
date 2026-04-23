# React Error Handling Example

Demonstrates all `RouterError` types and error handling patterns.

## What it covers

- `RouterError` codes: `ROUTE_NOT_FOUND`, `CANNOT_ACTIVATE`, `TRANSITION_CANCELLED`
- `try/catch` on `await router.navigate()` — structured error handling
- Fire-and-forget navigation — errors suppressed internally, UI safe
- `onTransitionError` plugin — real-time error log panel

## Run

```bash
pnpm install
pnpm dev
```
