---
"@real-router/core": patch
---

perf(core): a query-carrying `matchPath` drops ~10 % (#1819, #1796)

Resolving the four query strategies once at matcher construction removes a fixed
per-call cost from both URL directions. Split out of the refusal changeset per
`.changeset/README.md`'s "separate by type" — the timing is a consequence of that
change, not the change itself.

**Measured**, alternating processes, min-of-N timing reps, medians over 12
rounds, A/A floor **0.3–2.4 %** on the hot path (stated inline, as this package's
other perf notes do — a single-digit delta without a floor is not a result).

Against the version you are upgrading FROM: a query-carrying `matchPath`
**−10.2 %** and a query-emitting `buildPath` **−6.8 %**, on a three-key query.

⚠ The win is **concentrated, not uniform**, because what is removed is a fixed
per-call cost (~120–145 ns per `matchPath`, ~50–60 ns per `buildPath`) rather
than a proportional one. So it is roughly **−15 % at one query key, −10 % at
three, −4.6 % at eight**, and **zero on a URL with no query** — both directions
short-circuit before resolving. ⚠ A middle revision claimed ≈ −2 % there;
re-measured against a tighter floor it is −0.03 % / −0.47 %, i.e. inside the
noise, and the original "exactly zero" was right. Quoting the three-key cell alone
would read as a property of the call; it is a property of the shape.

⚠ **Construction gets slower, and an earlier revision of this section did not say
so while being headed "Measured cost".** Resolving once per matcher costs
`createRouter` **≈ +420…700 ns** (+1.3…2.4 %), `cloneRouter` **≈ +220…690 ns**
and `dispose()` **≈ +250…310 ns** (+9…13 % of a teardown), since it runs a
resolution where it ran none. A route mutation is **≈ +220…300 ns**
(+2.6…3.6 %) — an earlier revision called that one unresolved, and an
independent re-measurement resolved it well outside its floor. Where two runs of
the same protocol disagree, both ends are given rather than the flattering one. An SSR
request that clones and disposes pays **≈ +930 ns** and earns it back on its
seventh query-carrying `matchPath`. Immaterial against a ~32 µs construction, but
it is a cost and it belongs in a section that names its gains.

⚠ A first revision of this paragraph quoted +148 ns / +84 ns / +232 ns — three to
five times low, from a harness whose A/A floor was wider than the effect. The
numbers above come from alternating whole processes, min-of-9 reps, 16 pooled
rounds, against a cross-checkout A/A floor of 0.4–1.3 %.

⚠ An earlier revision quoted **−3.3 % / −3.0 %** against the **pre-#1796** base.
Those numbers reproduce against that base, but that base is not this one:
#1796's first half is already released, so the figure nets this branch's win
against a regression consumers already have and prints the smaller number.
