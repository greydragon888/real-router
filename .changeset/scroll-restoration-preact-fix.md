---
"@real-router/preact": minor
---

Fix scroll restoration not firing on browser back/forward under navigation-plugin (#657)

Since #657 lifted `replace` into `TransitionMeta`, a history **traversal** (back/forward) under `navigation-plugin` now arrives with `transition.replace === true` — a traversal reuses an existing history entry, which is replace-shaped at the history level. `createScrollRestoration` evaluated its replace-skip guard *before* the back/traverse restore branch, so every back/forward navigation was swallowed and the saved scroll position was never restored.

Reordered the restore decision tree so `reload` and `back`/`traverse` restore branches run **before** the genuine in-place-replace skip (`router.navigate({ replace: true })`, `navigateToNotFound` still skip as before).

Also hardened restore for a custom `scrollContainer` that mounts or lays out a few frames after the navigation settles (heavy routes): restore now re-applies the scroll across a bounded frame budget until the container exists and the position sticks, instead of a single best-effort `scrollTo` that could clamp to 0 against not-yet-laid-out content.
