# Bug Report: Stack Overflow in `commitLocation` Promise Chain

## Which project does this relate to?

Router

## Describe the bug

Each call to `commitLocation` creates a new `ControlledPromise` whose `onResolve` callback synchronously resolves the **previous** promise. This forms an unbounded singly-linked list of closures. When the chain is finally resolved (on `load()` completion), the entire list unwinds in a single synchronous call stack, crashing with `RangeError: Maximum call stack size exceeded`.

Bug discovered while building a client-side navigation benchmark suite. I adopted TanStack Router as a baseline and ran a 10-second continuous navigation loop in JSDOM — the process crashed after ~5,000–10,000 navigations.

**Related:** [#2871](https://github.com/TanStack/router/issues/2871) — reported a similar stack trace but was closed as user error (infinite redirect loop). The underlying `commitLocationPromise` chaining issue was not investigated.

## Your Example Website or App

N/A — standalone Node.js script, see Steps to Reproduce.

## Steps to Reproduce the Bug or Issue

1. Save the following as `repro.mjs`:

```js
// repro.mjs — run with: node repro.mjs
function createControlledPromise(onResolve) {
  let resolvePromise;
  const p = new Promise((resolve) => { resolvePromise = resolve; });
  p.status = "pending";
  p.resolve = (value) => {
    p.status = "resolved";
    p.value = value;
    resolvePromise(value);
    onResolve?.(value);
  };
  return p;
}

let commitLocationPromise;

for (let i = 0; i < 20_000; i++) {
  let previousCommitPromise = commitLocationPromise;
  commitLocationPromise = createControlledPromise(() => {
    previousCommitPromise?.resolve();
    previousCommitPromise = undefined;
  });
}

commitLocationPromise.resolve(); // 💥 RangeError: Maximum call stack size exceeded
```

2. Run `node repro.mjs`
3. Observe `RangeError: Maximum call stack size exceeded`

This reproduces the exact pattern from `@tanstack/router-core/src/router.ts` — the loop simulates rapid navigations that outpace `load()` completion.

In a real TanStack Router app the same crash occurs when `router.navigate()` is called in a tight loop (automated tests, programmatic navigation, redirect chains) — each call hits `commitLocation`, growing the promise chain until `load()` completion triggers the synchronous unwind.

## Expected behavior

Navigation should not accumulate unbounded synchronous state. Resolving `commitLocationPromise` should complete without stack overflow regardless of how many navigations preceded it.

## Screenshots or Videos

_N/A — reproducible via CLI._

## Platform

- Router Version: `@tanstack/router-core@1.168.9` / `@tanstack/react-router@1.168.10`
- OS: macOS (Darwin 25.2.0, Apple M3 Pro)
- Browser: N/A (Node.js v24.11.1 + JSDOM 28.1.0)
- Bundler: Vite 7.2.0

## Additional context

### Root cause analysis

#### 1. `createControlledPromise` — the building block

Source: [`router-core/src/utils.ts`](https://github.com/TanStack/router/blob/main/packages/router-core/src/utils.ts)

```typescript
function createControlledPromise<T>(onResolve?: (value: T) => void) {
  let resolveLoadPromise: (value: T) => void;
  const controlledPromise = new Promise<T>((resolve) => {
    resolveLoadPromise = resolve;
  });
  controlledPromise.status = "pending";
  controlledPromise.resolve = (value) => {
    controlledPromise.status = "resolved";
    controlledPromise.value = value;
    resolveLoadPromise(value); // resolve the underlying Promise
    onResolve?.(value); // ← fire the callback SYNCHRONOUSLY
  };
  return controlledPromise;
}
```

Key detail: `onResolve` is called **synchronously** inside `.resolve()`. There is no `queueMicrotask`, `setTimeout`, or `Promise.resolve().then()` deferral.

#### 2. `commitLocation` — the chain grows

Source: [`router-core/src/router.ts:2109–2113`](https://github.com/TanStack/router/blob/main/packages/router-core/src/router.ts#L2109-L2113)

```typescript
commitLocation = async ({ viewTransition, ignoreBlocker, ...next }) => {
  // ...

  let previousCommitPromise = this.commitLocationPromise; // capture current
  this.commitLocationPromise = createControlledPromise<void>(() => {
    previousCommitPromise?.resolve(); // onResolve: resolve the PREVIOUS one
    previousCommitPromise = undefined;
  });

  // ... push/replace history ...

  return this.commitLocationPromise;
};
```

Each navigation:

1. Captures the **current** `commitLocationPromise` in a closure
2. Creates a **new** one whose `onResolve` synchronously resolves the old one
3. The old promise's `onResolve` resolves the one before it, and so on

This forms a **singly-linked list** through closures:

```
Navigation 1:  P₁ (onResolve: noop)
Navigation 2:  P₂ (onResolve: → P₁.resolve())
Navigation 3:  P₃ (onResolve: → P₂.resolve() → P₁.resolve())
    ...
Navigation N:  Pₙ (onResolve: → Pₙ₋₁.resolve() → ... → P₁.resolve())
```

#### 3. `load()` completion — the chain detonates

Source: [`router-core/src/router.ts:2541–2543`](https://github.com/TanStack/router/blob/main/packages/router-core/src/router.ts#L2541-L2543)

```typescript
if (this.latestLoadPromise === loadPromise) {
  this.commitLocationPromise?.resolve(); // ← triggers the entire chain
  this.latestLoadPromise = undefined;
  this.commitLocationPromise = undefined;
}
```

When `load()` completes, `.resolve()` on the latest promise triggers:

```
Pₙ.resolve()
  → onResolve() calls Pₙ₋₁.resolve()
    → onResolve() calls Pₙ₋₂.resolve()
      → ... (N-1 more synchronous frames)
        → P₁.resolve()
```

**All N resolve calls happen synchronously on the same call stack.** With N ≈ 10,000, this exceeds V8's default stack size (~15,000 frames).

#### 4. Stack trace (annotated)

```
RangeError: Maximum call stack size exceeded

    at controlledPromise.resolve (router.ts)     ← Pₖ.resolve = (value) => {
    at commitLocation (router.ts)                ←   previousCommitPromise?.resolve()
    at controlledPromise.resolve (router.ts)     ←   onResolve?.(value)  [inside Pₖ₋₁]
    at commitLocation (router.ts)                ←   previousCommitPromise?.resolve()
    ... (pattern repeats until stack exhaustion)
```

### Why it doesn't crash in browsers (usually)

1. **Page reloads** — full navigation resets all JS state, clearing the chain
2. **User navigation pace** — humans navigate slowly; `load()` completes between navigations, resolving and clearing the chain while it's short (1–2 links)
3. **Route caching** — repeated visits to the same URL may skip `commitLocation`

However, the bug **can** manifest in production under:

- **Automated testing** (Playwright, Cypress) with rapid sequential navigations
- **Programmatic navigation** in loops (e.g., slideshow, wizard, auto-redirect chains)
- **Long-lived SPA sessions** with frequent navigation and slow/deferred `load()` completion

### JSDOM I/O backpressure artifact

During investigation, we found that **mocking `window.scrollTo`** or **filtering `console.error`** causes the crash to happen **immediately** instead of after ~10 seconds.

**Without mocks (JSDOM default):**

- JSDOM logs `"Not implemented: Window's scrollTo()"` via `console.error` on every navigation
- The I/O from `console.error` creates backpressure that yields the event loop
- This allows microtasks and `load()` completions to interleave, partially draining the promise chain
- Result: chain stays ~5,000–10,000 links before overflowing

**With `scrollTo` mocked to noop:**

- No I/O backpressure — navigations execute at full synchronous speed
- `load()` never gets a chance to complete between navigations
- Promise chain grows unboundedly from the very first navigation
- Result: **instant crash** (< 1 second)

This means the "working" behavior in JSDOM is an **accidental side effect** of `console.error` I/O timing, not a guarantee.
