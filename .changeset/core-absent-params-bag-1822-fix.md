---
"@real-router/core": patch
---

An absent bag has two spellings, and both are honoured (#1822)

`navigate(name, null)` is supported runtime input — pinned as "treats null params
as empty params and resolves" — while the signature admits only
`Params | undefined`. Every position that asks "is there a bag?" therefore has
two answers to recognise and a type that shows it one. Three asked for one, so
the other reached a `ToObject` and threw. All three now answer for `null`
exactly as they answer for `undefined`.

| door | before | after |
| --- | --- | --- |
| `navigate` · `makeState` · `buildNavigationState` · `forwardState` | bare `TypeError`, no code, no route name | same answer as `undefined` |
| `canNavigateTo` | **threw into the render path** | answers, as its "detecting is fine, throwing is not" rule requires |
| `navigateToState`, mis-channel check | **threw SYNCHRONOUSLY** | rejects, the shape URL plugins calling it from popstate handlers rely on |
| `navigateToState`, a State whose `params` or `search` slot is `null` | rejected with a bare `TypeError` — no `code` for `onTransitionError` to classify | commits, adopting the slot as empty |
| a `forwardState` interceptor returning `params: null` | killed `router.start()` | starts |
| `buildPath` | bare `TypeError`, on EVERY route | prints the href |
| `isActiveRoute` | its render-path net caught the same throw and called a link to the CURRENT page inactive | answers |

Three sites, one term each, spelled `== null` — the intent `Router` already
states in those words.

**`findMisChanneledKey`** (`src/channels/guard.ts`) is the always-on channel
guard's predicate, and the term belongs there rather than in
`assertChannelCorrect`: `canNavigateTo` and `navigateToState` reach it directly,
and neither may throw. Which call it hit depended on a fact about the ROUTE and
not about the argument — the `queryNames.length === 0` short-circuit shielded
every route without a `?` declaration.

**`normalizeChannel`** (`src/helpers.ts`) is what `buildPath` and `isActiveRoute`
reach without passing the guard at all. Its `undefined` arm passes the bag
through so a caller can still tell "no bag" from "empty bag"; `null` normalises
to the shared empty singleton — the same answer `{}` gets. Both channels pass
through it, so the query slot is covered by the same arm. `isActiveRoute` was the
worse half: a parameter default (`= EMPTY_PARAMS`) fires for `undefined` only, so
the throw travelled down and its safety net turned it into a wrong answer inside
a render, where nothing surfaces.

**`adoptForeignBag`** (`src/helpers.ts`) copies a bag the router does not own,
which is exactly the bag free to disagree with its declared type — an interceptor
spreading a partial result nulls a slot, the producer `Router`'s codec seam
already names.

Measured: `Object.hasOwn` throws for `null` and `undefined` and for nothing else
— not `0`, `""`, `false`, `NaN`, a string, a symbol or a BigInt. The two route
registration doors were immune all along, each by its own null gate.

The rule is stated as a property over `{undefined, null}` × route shapes × the
six synchronous doors and `navigateToState`
(`tests/property/absentBagSpelling.properties.ts`). Removing any one of the three
arms reds it — measured, not assumed. The committing door is in scope precisely
because `adoptForeignBag` is reachable through no other.

⚠ Unchanged, and deliberately: a key whose VALUE is `null` is still a real value
and still prints. `undefined`-blindness is about the removal marker and is a
separate rule from an absent bag.
