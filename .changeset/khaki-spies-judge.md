---
"@real-router/validation-plugin": patch
---

Check `revalidate` like every other boolean navigation option, and bind every name table to core

`isNavigationOptions` walks a hand-written list of five fields while its own docblock promised "all optional boolean fields". Core's `NavigationOptions` has six: `revalidate` arrived with #1201 and nothing here said so, so the guard admitted ANY value for it — a string, an object — while rejecting a non-boolean on each of its five siblings. The neighbouring pin enumerated the same five the list did, which is why it could not notice.

`revalidate` is in the list now, and what holds the list complete is an AST walk over core's own declaration rather than a type. ⚠ `NavigationOptions` is an OPEN interface — `browser-plugin`, `hash-plugin` and `navigation-plugin` all augment it — so `keyof` answers differently depending on which plugins the compilation unit can see, and an exhaustive `Record` keyed by it compiles inside this package while failing in every consumer that installs a URL plugin. A file walk sees core's declaration and nothing else, which is exactly the question worth asking; `satisfies` covers the other direction, so a name that is not a navigation option at all still fails to compile. A plugin's own augmented booleans stay unchecked, deliberately: this package cannot enumerate them.

The router option names ARE keyed by core's type, because `Options` is augmented by nobody.

That table was a `Set<string>` of twelve literals bound to nothing. It matched core, and the copy of them in this package's property-test helpers did not: it was missing `caseSensitive` and `defaultSearch`, so the generator behind "unknown option keys always throw" could draw a legitimate option and assert a throw that never comes. That helper now imports the table instead of repeating it.

Three more of its lists — the `trailingSlash`, `queryParamsMode` and `urlParamsEncoding` values — are keyed by core's types for the same reason. They feed both halves of one property: the generator of valid options, and the filter that decides which random strings count as INVALID. A member missing from the second lets the generator draw a value core accepts and assert a throw that never comes, which is the defect the option names carried, one axis over.

The five remaining lists there — the four `queryParams` formats and the logger level — are bound too, for a narrower reason: each feeds only a generator of VALID options, so drift costs coverage rather than correctness. A mode core adds is simply never drawn, no assertion turns false, and nothing reds. They reach their owners through the container type (`QueryParamsOptions["arrayFormat"]`, `LoggerConfig["level"]`) because the four format aliases are not on core's public types index.
