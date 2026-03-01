---
"@real-router/core": minor
---

Remove `State.meta.options` storage, move `reload`/`redirected` to `TransitionMeta` (#202)

**Breaking Change:** Navigation options are no longer stored in `state.meta.options`.

- `reload` and `redirected` flags are now available on `state.transition` after successful navigation
- `transitionPath` accepts optional `opts` parameter for reload detection
- `shouldUpdateNode` reads `reload` from `state.transition` instead of `state.meta.options`
- Removed `EMPTY_OPTIONS` constant and `cleanOpts` helper
