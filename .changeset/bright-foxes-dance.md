---
"@real-router/core": minor
"@real-router/logger-plugin": patch
"@real-router/browser-plugin": patch
---

Add internal isomorphic logger package for centralized logging

### New Features

**Isomorphic Logger** — works in browser, Node.js, and environments without `console`:

- Three severity levels: `log`, `warn`, `error`
- Four threshold configurations: `all`, `warn-error`, `error-only`, `none`
- Safe console access (checks `typeof console !== "undefined"`)
- Optional callback for custom log processing (error tracking, analytics, console emulation)
- `callbackIgnoresLevel` option to bypass level filtering for callbacks

**Router Configuration:**

```typescript
const router = createRouter(routes, {
  logger: {
    level: "error-only",
    callback: (level, context, message) => {
      if (level === "error") Sentry.captureMessage(message);
    },
    callbackIgnoresLevel: true,
  },
});
```

### Changes by Package

**@real-router/core:**
- Add `options.logger` configuration support in `createRouter()`
- Migrate all internal `console.*` calls to centralized logger

**@real-router/browser-plugin:**
- Migrate warning messages to centralized logger

**@real-router/logger-plugin:**
- Use internal logger instead of direct console output
