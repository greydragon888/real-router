---
"@real-router/ssr-data-plugin": patch
---

The staleness flag is cleared after the write, not before it (#1916)

The `invalidate()` refresh cleared the flag one line ahead of
`writeLoaderResult`, so a write that throws consumed the retry. Measured:

```
start                 loader ran, data "good"
invalidate + navigate write REJECTED (branded payload, no `deferred` bag)
next navigation       loader did NOT re-run, data undefined
```

The navigation rejected, no data was written, and the next navigation saw a clean
flag and did not try again — a refresh that never happened had been recorded as
one that did. The comment above the listener already stated the contract:
*"Flag is cleared only after a successful, non-cancelled loader write"*.

⚑ The reachable trigger is a loader that RESOLVES and produces a value the write
refuses — which is why the suites covering loader *rejection* never saw it: a
loader that throws never reaches `clearStale` at all.

⚠ #1916's other half — `isDeferred` admitting an own-branded object with no
fields — is unchanged and stays that way. It is `INVARIANTS.md` #7, pinned with a
property test whose comment states that its own failure IS the contract-change
signal. The damage that half described (a partial write left behind) was closed
by #1835, and the remaining silent path by #1917.
