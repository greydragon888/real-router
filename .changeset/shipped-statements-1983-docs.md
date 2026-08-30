---
"@real-router/core": patch
---

Three shipped statements corrected, and the one behavioural claim among them pinned (#1983)

- **`transition.redirected` is not set by the router.** The docblock said it was
  "automatically set … when a navigation is triggered by a redirect" and tagged
  the option `@internal`. Measured: the only way into the pipeline is
  `opts.redirected`, so the field is `undefined` after a `forwardTo` redirect and
  after a guard-driven one alike, and the `@internal` tag was telling the only
  party who *can* set it not to. The tag is gone (documentary only —
  `stripInternal` is not enabled, so no `.d.ts` surface changes) and the text now
  says who sets it. Also corrected in `core/CLAUDE.md` and in the wiki.
- **`force` and `reload` do not have "identical implementation effect".** Both
  get past the same-state equality check and part company there: only `reload`
  reaches `state.transition.reload`, which `Router.shouldUpdateNode` reads first.
  On a same-state navigation a strict ancestor of the intersection updates under
  `reload` and does not under `force`. Reach for `reload` when mounted
  components must re-render.
- **`removeRoute`'s docblock promised a boolean** and the function returns
  `readonly Route[] | undefined` — three outcomes, where an empty array is a
  successful removal and only `undefined` means "not a route".

Documentation only, with one test added: the `force` / `reload` divergence had
nothing holding it. Measured — making the two identical left all 4862 tests
green, so the corrected sentence would have rotted on its own.
