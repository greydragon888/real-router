---
"@real-router/svelte": patch
---

Silence intentional `state_referenced_locally` warnings in consumer builds (#815)

Add targeted `// svelte-ignore state_referenced_locally` comments at the
documented stable-router / captured-at-mount sites in `RouterProvider`, `Link`,
and `RouteView`, each with a one-line rationale. These one-time reads are
intentional by design (the `ROUTER_KEY` stability contract and the
"Link Active State Is Captured At Mount" gotcha), so the ~12 Svelte 5 warnings
they emitted in every downstream `vite build` were noise, not reactivity bugs.
Only the documented sites are suppressed — a future genuinely-reactive read
elsewhere still warns. No behavior change.

Thanks to [@g4m35](https://github.com/g4m35) for the original fix (PR #816).
