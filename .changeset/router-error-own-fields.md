---
"@real-router/core": patch
---

fix: `RouterError.hasField` / `getField` answer about OWN fields only (#1829)

Both walked the prototype chain — `key in this` and `this[key]` — so an error
carrying ONE custom field answered `true` for eighteen names and handed back native
methods for most of them:

```js
const err = new RouterError("SOME_CODE", { userId: "u1" });

err.hasField("toString");        // was true  -> now false
typeof err.getField("toString"); // was "function" -> now "undefined"
err.hasField("constructor");     // was true  -> now false
err.hasField("userId");          // true, unchanged
```

Twelve of those are `Object.prototype`'s members and six are the class's own
methods. `toString` and `constructor` are ordinary strings — they arrive from a
config key, a route param name, a serialized payload.

Every field the JSDoc promises still answers: `code`, `segment`, `path` and any
custom field are OWN properties, so `Object.hasOwn` keeps all four worked
examples while removing all eighteen false positives.

⚠ Behaviour change for a consumer that relied on the chain: `hasField` /
`getField` no longer reach `Object.prototype` members or the class's methods.
Both are public API with no call site in any `src/`, so this is a contract
correction rather than an internal one. The property tier did exercise them —
but its "non-existent field" generator prefixes and suffixes the random key, so
10 000 runs could never produce `toString`; the reachable half was added.
