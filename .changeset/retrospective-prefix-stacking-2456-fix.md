---
"@real-router/validation-plugin": patch
---

The retrospective pass names one subsystem, not two (#2456)

`resolveForwardChainWithPrefix` prepends `[validation-plugin]` to whatever core
raised. Core's forward-chain refusals now open with `[router] ` themselves (#2456),
which would have stacked two prefixes on one message:

```diff
-[validation-plugin] [router] Circular forwardTo: a → b → a
+[validation-plugin] Circular forwardTo: a → b → a
```

The head is replaced rather than kept: the retrospective walk is not a `router.*`
call — it runs over a table that is already registered — so `[validation-plugin]`
is the name a reader can act on, and `packages/validation-plugin/README.md`
documents it for this pass. Core's own wording, prefix included, stays reachable on
`error.cause`.

⚠ The plugin's **prospective** checks are not wrapped and were not changed:
`validateForwardToCycle` and `validateForwardToTargets` call core's
`resolveForwardChain` directly, so a cycle caught while registering reports
`[router]`. Both spellings are now pinned, so neither can drift.
