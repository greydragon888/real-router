---
"@real-router/core": minor
---

Fix: `add()` / `replace()` are now atomic for a guard factory that throws on compile (#956)

A guard factory passed via route config to `add`/`replace` that threw on compile (or returned a non-function) used to throw **after** the tree/config swap in `adoptRouteArtifacts`, leaving the store torn — the new route(s) were already in the tree even though the call rejected. `adoptRouteArtifacts` now compiles every pending guard factory **before** the swap, so a malformed factory aborts the mutation with the store untouched — completing the prepare-then-commit atomicity of #698 (previously atomic only for core build errors, not for guard factories). Guards are compiled once: the pre-compiled function is installed without re-invoking the factory, so a factory with compile-time side effects still runs exactly once.
