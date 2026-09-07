---
"@real-router/core": patch
---

Option sub-bags are adopted at construction, and a clone inherits its base's query strategies (#2171)

Until now core froze the options level its own spread minted and stopped there
(#1832), so every nested bag stayed the caller's object: `defaultParams` and
`defaultSearch` were re-read on **every** `navigateToDefault`, `limits` was
walked twice at construction, and all three were handed back by identity through
`getOptions()`. A write to a config bag after `createRouter` therefore moved what
the router navigated to — measured, `/u/1` became `/u/999`. Core now copies the
three bags it HOLDS, at one place in the constructor, and freezes its own copies;
the caller's originals stay the caller's and stay writable.

Each slot keeps the read semantics it already had. `limits` is own-enumerable,
matching `createLimits`' spread and the `#limitKeys` snapshot, so a clone cannot
become stricter than its base. `defaultParams` and `defaultSearch` are
own-enumerable too — the rule `Supported Input Shapes` already states for channel
bags — and their callback arms fall through untouched, because a function is
called rather than enumerated. Each copy drops an own `__proto__` for the reason
the level above does: the object is one core now mints, and #1957's exemption for
it ("the bag is the caller's, not ours") is exactly what this retires.

`cloneRouter` stops rebuilding query strategies from the caller's raw bag and
inherits the base's resolved snapshot instead — the last slot in that function
still doing so, after `urlParamsEncoding` (#1877), `limits` (#1880 / #1961) and
`logger` (#1930) each stopped as bug fixes. That re-read was never the harmless
half: re-validation refuses what is INVALID but cannot notice a value that is
merely DIFFERENT, so a drift to another valid format gave the clone a different
URL from its base with **no error and no warning** (#2032), against three shipped
sentences saying such a config makes the clone fail. The caller's bag is now read
once, at construction, and the clone adds none.

⚠ `getOptions().queryParams` deliberately still hands back the caller's object,
and that is a measured exception rather than an omission. Handing back the
snapshot means handing back the four DECLARED names only, so a mis-spelled
`arrayFromat` disappears and `@real-router/validation-plugin` loses the
unknown-option report it raises for exactly that typo — measured, the key set
went from `["arrayFormat", "arrayFromat", "extra"]` to `["arrayFormat"]` with all
815 of that plugin's cells still green, i.e. unpinned.

⚠ Breaking for an application that MUTATES a config bag after `createRouter` and
expects the router to follow. That was never documented and reads as aliasing
rather than as configuration; `@real-router/validation-plugin` will report it
(#2148). An application that builds its config before constructing the router —
the ordinary case — is unaffected.

⚠ Also breaking for a clone whose base was given a drifting `queryParams`: the
clone no longer re-runs the refusal, because there is no second read to refuse.
The property that drift cannot poison the long-lived base is unchanged. And the
clone's own `getOptions().queryParams` now reports the four declared names — the
same asymmetry `urlParamsEncoding` already carries, where only the clone honours
the documented shape.

A config getter that throws is now reported by FIELD — `Invalid "defaultParams":
reading it threw` with the original as `cause` — matching what `queryParams`
already did. Before, the same getter escaped as a bare `Error` naming no option,
just later, from the first navigation instead of from the constructor.

Decision: #2145. Umbrella: #1901.
