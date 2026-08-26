---
"@real-router/ssr-data-plugin": patch
---

Hydration asks whether the server really answered, not whether the name is on the prototype (#1838)

The SSR loader factory (`shared/ssr/createSsrLoaderPlugin.ts`, shared by both
loader plugins) decided "did the server already fill my namespace?" with
`config.namespace in hydrationState.context`. The context arrives from
`JSON.parse` of the SSR payload, so its prototype is `Object.prototype`, and the
namespace is a developer-chosen string that core accepts as long as it is a
non-empty string.

Measured on a parsed context:

```
namespace     in      hasOwn   typeof context[ns]
data         true     true     object      ← a real server answer
missing      false    false    undefined
toString     true     false    function    ← a false "the server answered"
constructor  true     false    function
```

So a plugin whose namespace collided with a prototype member skipped re-running
its loader on the client and published the native method as the server's data.

`Object.hasOwn` keeps the documented "presence wins" rule exactly — an own
`undefined` left in the namespace still counts as the server's authoritative
answer, which is what the in-memory hydration paths rely on — and removes only
the inherited false positive.

Part of #1901.
