---
"@real-router/core": patch
---

Say what the PluginApi membership rule's cells actually derive (#2383)

`packages/core/CLAUDE.md` states that neither clause of the membership rule has a
cell that derives it. Clause (a) is not answered by `door-census/consumers.test.ts`:
its reverse column asks whether a member is untouched by shipped code **and** tests
together, which is wider than the clause, and the walk behind it records reach only
where it can resolve the owner of a property access — so an api arriving as a bag
field, a class field or a destructured parameter stays invisible to it. #2350 and
#2383 own the two gaps.

The census's own `getPluginApi: []` comment carries the same limit and now names it.
`Router.ts`'s per-router logger comment names the frozen three-method view a plugin
reads on `PluginApi` (#2339).

Comments only — no behaviour change.
