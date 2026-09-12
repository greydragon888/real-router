---
"@real-router/core": patch
---

A decoder's container is read once, as its encode twin already was (#2254)

`decodeParams` may return a container backed by accessors — it is application
code — and core read its `params` slot twice: once for the checks and once for
the consumer that builds the state. At two reads the value that is judged is not
the value that ships, which is the #2134 class. `encodeParams` already read once,
so the pair disagreed about the same contract.

Each slot is now read once and the result rebuilt as a plain object, so no
consumer downstream can reach the accessor again.
