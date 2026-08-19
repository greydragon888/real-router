---
"@real-router/core": minor
"@real-router/validation-plugin": minor
---

**An own `__proto__` key is answered by the SOURCE of the data (#1792).**

`__proto__` is the only ACCESSOR among `Object.prototype`'s twelve own members,
so `bag[key] = value` for it reaches the inherited setter, creates no own key,
and the value disappears with no error and no log. Every layer that met that
fact answered it separately, and the repository accumulated four policies for
one key. There is one rule now, and it keys on where the data came from:

| source | answer |
| --- | --- |
| the caller's per-navigation `params` / `search` bag | **refused** — a synchronous `TypeError` |
| a URL | **dropped**, and reported by `@real-router/validation-plugin` |
| a route's static config (#1788), a plugin's context namespace (#1191) | **untouched** |

**The refusal** is core's sixth always-on invariant guard, at the same three
producers the channel guard (#1572) uses — `navigate`, `makeState`,
`buildNavigationState` — and synchronous for the same reason: an argument-shape
defect at the API boundary, caught before any transition exists. The caller
wrote the name; telling them beats any silent handling.

**The drop** is in `pipeline/canonicalize`, beside the mode gate. A URL is not
the caller's code and `match()` must never throw on input (#737) — a link from
anywhere would otherwise crash a popstate handler. Bare core is silent; the
validation plugin says it once per route+key, per router (#1583).

⚠ **The obvious alternative — carry the key as data everywhere — was built
first, measured, and rejected.** It does not keep the hazard in core, it
EXPORTS it: once the key survives into `state.params` / `state.search`, every
consumer meets it, and `Object.assign` (how application code merges bags) drops
it exactly as core did. Measured downstream on that build: `logger-plugin`'s
diff accumulator had its PROTOTYPE replaced by caller data and logged a blank
line; `persistent-params-plugin` lost the key on every navigation;
`search-schema-plugin` corrupted the prototype of the bag it returns AS the
state, which the state guards then reject as "not a plain object". Nine sites in
core and three plugins is the cost of carrying it. One refusal is the cost of
not.

⚠ **Breaking, narrowly.** `navigate` / `makeState` / `buildNavigationState`
throw where they previously accepted the bag and silently mishandled the key. A
caller reaching this has a field literally named `__proto__` in a params or
search bag; the error names the channel and the remedy.

**Found by an eight-lens adversarial pass**, which also recorded a
pre-existing defect this change does not fix: `navigate(name, null)` throws a
raw `TypeError: Cannot convert undefined or null to object` from
`findMisChanneledKey` — but only when the route declares query params, since
that guard's `queryNames.length === 0` early return shields every other route by
accident. Same "survival depends on an unrelated fact" shape, different owner.
