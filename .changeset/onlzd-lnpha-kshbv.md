---
"@real-router/logger-plugin": minor
---

Add performance tracking to logger-plugin

### New Features

**Timing Display** — transition duration with adaptive units:

```
Transition success (15.00ms)   // normal transitions
Transition success (27.29μs)   // fast transitions (<0.1ms)
```

**Performance API Integration** — marks and measures for browser DevTools:

```
Marks:
├── router:transition-start:{from}→{to}
├── router:transition-end:{from}→{to}
├── router:transition-cancel:{from}→{to}
└── router:transition-error:{from}→{to}

Measures:
├── router:transition:{from}→{to}
├── router:transition-cancelled:{from}→{to}
└── router:transition-failed:{from}→{to}
```

### Configuration

```typescript
router.usePlugin(loggerPluginFactory({
  showTiming: true,           // default: true
  usePerformanceMarks: true,  // default: false
}));
```

### Implementation Details

- Monotonic time provider with environment-aware fallback:
  - Browser: `performance.now()`
  - Node.js 16+: `performance.now()` from `perf_hooks`
  - Node.js <16: `Date.now()` with monotonic emulation (handles NTP sync, DST)
- Safe Performance API access — graceful no-op if unavailable
