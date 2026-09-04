---
"@real-router/svelte": patch
---

`shallowEqual` decides membership from the list it counted ([#2064](https://github.com/greydragon888/real-router/issues/2064))

Two prop bags with **disjoint** own-enumerable surfaces no longer compare equal,
so the memoised `<Link>` re-renders instead of keeping the previous href and
active class.

The comparator counted own **enumerable** keys with `Object.keys` and then
decided membership with `Object.prototype.hasOwnProperty`, which answers `true`
for a key that is own but **not enumerable** — and, on a `Proxy`, for a key
`ownKeys` never listed at all. The two predicates disagree on exactly the keys
the count refuses to see. Membership now comes from the second key list, which
the count already built and threw away.

Measured, with the controls that make it a measurement:

```
shallowEqual({a:"1"}, conceal({b:"2"}, {a:"1"}))   was true   → false
shallowEqual({a:"1"}, proxyVouchingFor("a"))      was true   → false
shallowEqual({a:"1"}, {a:"1"})                    true       → true
shallowEqual({a:"1"}, {b:"2"})                    false      → false
```

Reachability is narrow — an application has to hand `<Link routeParams>` a bag
with a concealed or Proxy-vouched key — but the Proxy half is not hypothetical:
Svelte 5's `$props()` reports own-ness for a key only its prototype has, on
every render ([#1853](https://github.com/greydragon888/real-router/issues/1853)).

The predicate family was re-measured on this site rather than inherited:
`key in next`, `Object.hasOwn` and `propertyIsEnumerable` each leave at least
one of the new cells red. Same shape core took for `recordsShallowEqual` in
[#1815](https://github.com/greydragon888/real-router/issues/1815).
