# @real-router/svelte — Invariants

Invariants verified by property-based tests in `tests/property/`.

## shouldNavigate (Link click handler)

| # | Invariant | Why it must hold |
|---|-----------|-----------------|
| 1 | **Left click, no modifiers** — `shouldNavigate(evt) === true` | Standard left-click must trigger client-side navigation |
| 2 | **Any modifier key** — `shouldNavigate(evt) === false` | Meta/Alt/Ctrl/Shift clicks open in new tab or trigger OS actions — must not be intercepted |
| 3 | **Non-zero button** — `shouldNavigate(evt) === false` | Middle-click (button=1) and right-click (button=2) have browser-native behavior |
| 4 | **Purity** — same inputs always produce the same result | Function has no side effects and no hidden state |

## buildActiveClassName (Link class computation)

| # | Invariant | Why it must hold |
|---|-----------|-----------------|
| 1 | **Inactive returns baseClassName** — `buildActiveClassName(false, *, base) === base` | Inactive links must only show their base class |
| 2 | **Active includes activeClassName** — result contains `activeClassName` when `isActive=true` | Active links must visually indicate their state |
| 3 | **No "undefined" string** — result never contains the literal `"undefined"` | String concatenation with `undefined` must not leak into DOM class attribute |
| 4 | **No leading/trailing spaces** — `result === result.trim()` | DOM class attributes must be clean — browsers tolerate whitespace but it indicates a bug |
