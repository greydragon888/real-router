---
"@real-router/persistent-params-plugin": minor
---

A persistent-param name the router can never publish is refused at the factory (#1810)

`validateParamKey` only ever checked a charset (`= & ? # % / \` and whitespace),
so `"__proto__"` was accepted as a param name. It can never work: the router
withholds that one key from `state.params` / `state.search` at the channel copy,
so the value has no way to reach a URL. Measured before this change:

```
persistentParamsPluginFactory(["__proto__", "mode"])   ACCEPTED
navigate("page", {}, { __proto__: "V", mode: "dev" })
  href                              /page?mode=dev
  state.context.persistentParams    { __proto__: undefined, mode: "dev" }
```

So the plugin published a key that was both unusable and `undefined`-valued,
beside the params that do work. It now throws a `TypeError` at factory time, and
the message says why rather than reporting the name as malformed — `"__proto__"`
IS a non-empty string, so the generic "Expected array of non-empty strings"
reads as a contradiction to whoever wrote it.

⚠ **The refusal is NARROW, and that is measured.** Across all twelve own members
of `Object.prototype`, each tracked and navigated with a value, eleven print
`/page?<name>=V` and land in `state.search` — including the four `__define*__` /
`__lookup*__` accessors. Only `__proto__` never arrives. Refusing the others
would retire a working capability.

⚠ A SOURCE LITERAL `{ __proto__: "x" }` is unaffected and always was: it sets the
object's prototype and creates no own key, so there is no param by that name to
refuse. The own-key spellings (`Object.fromEntries`, `JSON.parse`, a computed
key) are the ones this reaches.

**Documentation, and the other half of the issue.** `extractOwnParams` was named,
documented and commented as the plugin's prototype-pollution boundary while its
example built the wrong shape — `Object.create({ __proto__: … })` creates no own
key, so it demonstrated inherited-key filtering and never the concern it named —
and promised an output "(no `__proto__`)" that the function does not produce. Both
docblocks now state what the helpers actually guarantee: own keys only, every own
key kept as ordinary data whatever it is called, and the write safe against an
ambient accessor since `putField`. Stripping the key there would be redundant
rather than safer — an untracked name is filtered downstream (measured: it
reaches neither the URL, nor `state.search`, nor the published context), and a
tracked one can no longer be `"__proto__"`.

Part of #1901.
