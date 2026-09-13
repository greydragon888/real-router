---
"@real-router/vue": patch
---

A `<Link>` whose router core cannot read says so (#2294)

The href door accepts a `Router`-SHAPED object by contract, so an unregistered
double keeps rendering the literal path in silence. A REAL router core cannot
reach — wrapped in a `Proxy`, or built by a second copy of `@real-router/core` —
took the same path, and silently stopped resolving `forwardTo`: the href was no
longer where its click lands.

The rendered href is unchanged. What is new is a `console.error` naming the two
reachable causes, in the case that previously said nothing.
