---
"@real-router/ssr-utils": patch
---

An enumerated leaf that forwards must land on a URL the manifest produced (#2256)

Since #2250 an href RESOLVES the `forwardTo` chain, so `<Link routeName="old">` renders the TARGET's URL. `getStaticPaths` prints the LITERAL form — the one that answers about the route it was NAMED (INVARIANTS #8) — so an entry supplied for a forwarding source wrote a file at the SOURCE's URL while the href that reaches users named one the manifest never produced. On a static host that is a silent 404, and nothing in the build failed.

```
entries: old → [{ params: { id: "1" } }],  fresh → [{ params: { id: "2" } }]

manifest        /home | /old/1 | /fresh/2?tab=a | /bare
navigate(old,1) /fresh/1?tab=a                              ← no file
```

`getStaticPaths` now fails the build, naming both URLs — the same posture `findLostKeys` already takes, for the reason recorded beside it: SSG is a build step, so failing it is cheap and it is the only signal the author gets.

**The trigger is `forwardTo` on an enumerated leaf, not "the target takes params".** The issue framed the risk as a target that takes params with differing entry sets; measured, a parameterless source forwarding to a route with CHILDREN lands on `/parent`, which a leaf-only enumerator never emits. Both shapes are covered because the predicate asks where the link lands, not what the target declares.

**The check asks `forwardState` — the door `buildHref` asks.** Not `buildNavigationState`, which the issue proposed: both resolve the whole chain and the URL is identical, but the committing door opts into `reportUndeclaredParamKey`, and enumerating a manifest commits nothing. Asking a different door than the href asks is how a check and the thing it checks drift apart.

⚠ **It reports; it never emits.** Leaf-only enumeration is an explicit contract (#608, closed NOT_PLANNED — explicit over magic), so inferring a page the author did not enumerate is exactly what that decision refuses. The message names the source, the URL every link renders, and the two ways out: enumerate the target, or drop the source from `entries` and let the link resolve at runtime.

Nothing changes for a manifest that already covers its targets, for a leaf with no entry, or for a leaf that does not forward — each has a control cell. `packages/ssr-utils/CLAUDE.md` records the rule and the six `ssg/` example READMEs carry the one-line requirement.
