---
"@real-router/validation-plugin": patch
---

Check `revalidate` like every other boolean navigation option, and key both name tables by core's types

`isNavigationOptions` walks a hand-written list of five fields while its own docblock promised "all optional boolean fields". Core's `NavigationOptions` has six: `revalidate` arrived with #1201 and nothing here said so, so the guard admitted ANY value for it — a string, an object — while rejecting a non-boolean on each of its five siblings. The neighbouring pin enumerated the same five the list did, which is why it could not notice.

The list is now keyed by `Record<Exclude<keyof NavigationOptions, "signal">, true>`, so a boolean field core adds fails to compile here instead of being silently unchecked. `signal` stays carved out because it is an `AbortSignal`, checked beside the loop.

The same shape now keys the router option names, which were a `Set<string>` of twelve literals bound to nothing. They matched core, and the copy of them in this package's property-test helpers did not: it was missing `caseSensitive` and `defaultSearch`, so the generator behind "unknown option keys always throw" could draw a legitimate option and assert a throw that never comes. That helper now imports the table instead of repeating it.

Three more of its lists — the `trailingSlash`, `queryParamsMode` and `urlParamsEncoding` values — are keyed by core's types for the same reason. They feed both halves of one property: the generator of valid options, and the filter that decides which random strings count as INVALID. A member missing from the second lets the generator draw a value core accepts and assert a throw that never comes, which is the defect the option names carried, one axis over. The five remaining lists there feed valid generators only, where drift costs coverage rather than correctness; they are left for a follow-up.
