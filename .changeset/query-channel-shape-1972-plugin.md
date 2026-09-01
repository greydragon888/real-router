---
"@real-router/validation-plugin": minor
---

The query channel gets a shape validator (#1972)

`validateSearch` is the twin `validateParams` never had. Measured with the plugin
installed, before:

```
buildPath("h", { id: "1" }, "str")   ->  /h/1?0=s&1=t&2=r
navigate("h", { id: "2" }, "str")    ->  resolves, state.search = {"0":"s","1":"t","2":"r"}
makeState("h", { id: "1" }, "str")   ->  hands a plugin the same corrupted state
isActiveRoute("h", { id: "1" }, "str") -> answers, silently

CONTROL, the same junk one channel over:
navigate("h", "str")                 ->  throws "params must be a plain object"
```

⚑ Shape only, and deliberately not the value inspection its path twin runs. A
query value is printed with `String()` and round-trips through the URL, so the
Symbol / BigInt / control-character rules that make a PATH segment
unrepresentable do not transfer. What was missing is that nothing asked whether
the bag was a bag.
