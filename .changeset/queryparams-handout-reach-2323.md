---
"@real-router/core": patch
---

Pin the analyser's reach into `queryParams`, and say why the slot keeps the caller's object (#2323)

Documentation and tests only — no behaviour change.

`getOptions().queryParams` is the one option slot core hands back by identity
rather than as a copy, and the half that keeps the caller's object is what lets
`@real-router/validation-plugin` report a mis-spelled option name. Judging a
NAME is the analyser's work, so the slot stays as it is — but nothing said so,
and nothing noticed when it stopped being true: narrowing the handout to core's
own snapshot left every cell in that plugin's suite green, measured.

`validation-plugin/tests/functional/queryparams-handout-reach-2323.test.ts` now
owns the path end to end, in four cells, and both halves are mutation-validated:
narrowing the handout in core reds two of them, and removing the plugin's
unknown-key branch reds one. The declared key set is derived from core's own
snapshot rather than listed, so a fifth format moves both sides at once, and the
clone's deliberate silence — it builds from the base's resolved strategies — is
pinned beside it rather than left to read as an oversight.

The `⚠` in `OptionsNamespace/adoption.ts` that recorded this as an unpinned
exception now names that file instead of carrying a count of green cells, which
went stale twice while it stood.
