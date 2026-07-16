# Scenario Lag Analysis — why real-router lags, factually

> The **canonical, tracked ledger** of *why* real-router loses or trails a competitor
> in a cross-router benchmark cell. Every entry is a **root cause proven by
> investigation** — a same-session A/B, a code trace, or an issue-backed fact — not a
> guess. This complements the interactive infographic deck (built from `results/`, which
> shows *what* the numbers are and *the* verdict); this
> file answers **"is the red a weakness or a paid-for trade-off, and is it winnable?"**
>
> **Why this file exists:** we run many perf investigations. Their conclusions used to live
> only in the assistant's private memory. This ledger makes them durable, reviewable, and
> extensible in the repo.

## How to read an entry

Each lag carries three tags:

**Confidence** (how the cause was established):
- `A/B-proven` — an isolated same-session A/B pinned the cause (built the variant, measured OLD vs NEW back-to-back, drift-cancelled).
- `code-traced` — traced in source to the deciding line(s), issue-backed.
- `inferred` — reasoned from the bench data + cross-cohort pattern; **hypothesis, not yet A/B'd**.

**Cause class** (the handful of structural axes that explain almost every lag):
- `EAGER-CORE` — core loads/parses its full graph + builds the trie + runs the initial transition upfront (the price of O(1) matching + the full pipeline). Boot cost.
- `<Link>-COMPONENT` — real-router's `<Link>` is a component (reactive href + active-class); the competitor uses a plain `<a>`. real-router's own plain-`<a>` API is `use:link` (Svelte) / equivalents. Component-vs-plain-`<a>`.
- `IMMUTABLE-STATE` — a fresh, frozen `State` is allocated per navigation; the competitor mutates a signal/store in place. Retained-heap / GC-churn cost.
- `SCALE-FLOOR` — matcher/route-tree/table cost at scale (deep nesting, 10k routes); eager trie vs the competitor's lazy/lighter structure.
- `FRAMEWORK-NATIVE` — the competitor is compiler-fused (sv-router is written *in* Svelte) or has native per-instance reactivity (vue-router); it does structurally less.
- `DEFERRED-COMMIT` — an adapter surfaced the route change to the DOM a task late (a scheduler hop). **Addressable** — see angular #1466.
- `COMPETITOR-ARTIFACT` — the "lag" is the competitor's metric quirk (non-monotonic sweep, throughput confound), not a real-router cost.
- `NOISE` — the margin is within/near RME; the rank is not stable.

**Verdict** (what we do about it):
- `FIXED` — root-caused and fixed (issue #).
- `STRUCTURAL` — an identity trade-off we keep in v1 (does more, scales differently); not chased.
- `FEATURE-COST` — the lag *buys* a capability the competitor doesn't offer (active-class, validated pipeline). Reframe, don't chase.
- `WINNABLE (open)` — a real, addressable adapter lever that has NOT been done. The only class worth an issue/PR.
- `v2-CANDIDATE` — v1-structural, but a named v2 RFC would plausibly reduce it (not a v1 action).
- `ARTIFACT` / `NOISE` — not an action item.

**Discipline:** sub-ms cells are session/load-dependent — a lag is only "real" when the margin ≫ RME, and "winnable" is only ever proven by a same-session A/B, never by reasoning. Record the RME.

---

## Summary matrix (lags only; wins omitted)

| cohort | scenario | margin vs best competitor | cause class | confidence | verdict |
|---|---|---|---|---|---|
| all | cold-start | +36–75% (svelte +44%, angular 3.1×) | `EAGER-CORE` | code-traced (#1106) | `STRUCTURAL` / `v2-CANDIDATE` |
| svelte | link-build | 🔴 3.8× (12.1 vs 3.2 ms mount) | `<Link>-COMPONENT` | code-traced (#1099/#1247/#1253) | `FEATURE-COST` (use:link = fast path) |
| svelte | nested-switch | +42% (0.135 vs 0.095) | `<Link>-COMPONENT` (active-class flip ×2) | **A/B-proven** | `FEATURE-COST` — *outlet-swap BEATS sv-router* |
| svelte | param-nav | +16% (0.093 vs 0.080) | `<Link>-COMPONENT` + `IMMUTABLE-STATE` | **A/B-proven** | `STRUCTURAL` (plain-a → parity-minus, no flip) |
| svelte | table-heap | 🔴 2.6× (5.9 vs 2.3 MB @10k) | `SCALE-FLOOR` (**98% route-tree+trie**, ~650 B/route) | **measured (heap-decomp)** | `STRUCTURAL` |
| svelte | nav-churn | +60% (396 vs 248 KB/nav) | `IMMUTABLE-STATE` | code-traced | `STRUCTURAL` / `v2-CANDIDATE` |
| svelte | deep-config | +56% browser (3.23 vs 2.07 @90) — **RENDER, not matcher** | `FRAMEWORK-NATIVE` render (isolated matcher: rr **WINS 72×**, sv-router 200 vs 2.8 µs) | **measured (isolated)** | `STRUCTURAL` (compiled render) |
| svelte | back-forward | +2% (0.207 vs 0.203) | core back/forward path; sv 4µs lighter | inferred | `FRAMEWORK-NATIVE` (tiny; ~floor) |
| solid | nav-churn | +28% (310 vs 242 KB/nav) | `IMMUTABLE-STATE` | code-traced | `STRUCTURAL` / `v2-CANDIDATE` |
| solid | table-heap | +3% (5.78 vs 5.61 MB @10k) | `SCALE-FLOOR` (route-tree+trie — same class) | **measured (heap-decomp)** · +3% near-floor | `STRUCTURAL` (tiny) |
| angular | nav-latency/param/nested/active/back-fwd/churn | *(was up to ~4× behind)* | `DEFERRED-COMMIT` (zoneless async CD) | **A/B-proven** | ✅ `FIXED` (#1466 — sync-commit) |
| angular | cold-start, table-heap | 3.1×, +70% | `EAGER-CORE`, `SCALE-FLOOR` (route-tree+trie) | code-traced / **heap-decomp** | `STRUCTURAL` |
| react, vue, solid | deep-config (matcher, isolated) | 🟡 rr #2 to TanStack O(1) (~2.7×, µs) | `SCALE-FLOOR` (trie O(depth) vs static-path index O(1)) | **measured (isolated matcher)** | `STRUCTURAL` — react-router #15249 = **6–9 ms** matcher (debunked as the @90 "winner") |
| react | search-param-scaling | 🔴 +48% (0.53 vs 0.36 ms @256, both sub-ms) | `IMMUTABLE-STATE` (eager O(count) materialize; react-router's eager read is lighter) | measured one-realm n=50 | `STRUCTURAL` (rr does more per pass) |
| vue | active-links | ~~🔴 +55%~~ → **rr WINS 4.3×** | `COMPETITOR-ARTIFACT` (bench-app: rr shell subscribed to route over N `<Link>`; vue-router isolates in `<RouterView>`) | **A/B-proven** | ✅ `FIXED` (#1483 — bench-app view-isolation) |
| vue | nav-churn | 🟡 +2% | `IMMUTABLE-STATE` / near-floor | inferred | `NOISE`/`STRUCTURAL` |

**Cross-cohort read:** real-router's red is concentrated on **four structural axes** — eager-core boot, `<Link>`-component vs plain-`<a>`, immutable-state allocation, and matcher/table scale-floor — plus the competitor's own framework-native lightness. None is a per-nav *slowness* of the core (per-nav, real-router leads every cohort). **Two** genuinely-addressable classes have now been found and closed: `DEFERRED-COMMIT` (#1466, adapter sync-commit) and a bench-app `COMPETITOR-ARTIFACT` (#1483 — the vue active-links "lag" was the rr links-app subscribing its `<Link>`-mounting shell to route; aligning it to the competitor's view-isolation flips rr from −2.15× to **+4.3×** and O(N)→O(changed)). Neither was an adapter or core cost.

---

## Detailed root causes (A/B-proven)

### angular per-nav — `DEFERRED-COMMIT` → **FIXED (#1466)**

- **Was:** every plain-link nav on the angular adapter surfaced the route change to the DOM ~0.6–0.9 ms after the click task (`navMsWall ≫ navMsTask`), so angular *felt* up to ~4× slower on nav-latency despite real-router's CPU/task being the cohort's lowest.
- **Root cause (A/B-proven):** under zoneless change detection the route source notifies **synchronously** from `router.navigate()`, but a route-state read in a template only re-renders on Angular's **asynchronously scheduled** CD flush. `@angular/router` commits its `<router-outlet>` imperatively in-task; the adapter deferred.
- **Fix:** `RouteView` + `injectRoute`/`injectRouteNode` call a local `detectChanges()` from the source callback (fires outside Angular CD, so it's safe — mirrors `RealLink`'s direct-DOM write). Same-session A/B: nav-latency 0.97 → 0.07 (~13×). n=50 @`622b27be`: real-router now leads `@angular/router` on all six per-nav wall axes.
- **Lesson:** a deferred-commit lag *is* addressable — look for a scheduler hop between the source notify and the view commit.

### vue + react active-links — `COMPETITOR-ARTIFACT` (bench-app shell subscribed to route) → **FIXED (bench-app view-isolation)**

- **Was:** rr *appeared* to lose vue active-links to vue-router (@256 `navMsTask` **1.19 ms** vs **0.55 ms**, +115% / 2.15×, RME <1%) — framed as the one cohort where a framework-native router beats rr on active-links (#1483, "O(N) render per nav").
- **Root cause (A/B-proven):** NOT the adapter and NOT a `FRAMEWORK-NATIVE` floor. The rr links **bench-app** subscribed its root `App` shell to `useRoute()` (to render the inline `<main>`), so every navigation re-rendered the whole shell — re-creating all N `<Link>` vnodes → **O(N) VDOM reconciliation per nav**. vue-router's app isolates the route-dependent view in `<RouterView>` (react-router in `<Outlet>`), so its `<Link>`-mounting shell never re-renders. rr's active-source (`createActiveNameSelector`) is already O(1) subscription + O(changed) notify (#1416) — it was never the cost. Sites: `apps/vue/real-router/links/src/main.tsx`, `apps/react/real-router/links/src/main.tsx`.
- **Fix:** move the route-dependent `<main>` into its own route-subscribed component, so the shell that mounts the N `<Link>`s does not call `useRoute()` and never re-renders on navigation — mirroring the competitor's view-isolation.
- **A/B (same-session, drift-cancelled ≤1%, n=20, navMsTask@256):**
  - **vue:** rr-current **1.19** (slope 11×, O(N)) → rr-fixed **0.128** (slope 1.6×, **O(changed)**) vs vue-router **0.55** (slope 3.4×, O(N)). Fixed rr **BEATS vue-router 4.3×** — and is O(changed) where vue-router is O(N). Fix gain 9.3×.
  - **react** (symmetry, same VDOM class): rr-current **0.464** (slope 3.5×, `memo`-softened) → rr-fixed **0.156** (slope 1.4×, **O(changed)**) vs react-router **2.04** (slope 8.4×). rr already won; fix extends the lead to ~13×.
- **Verdict:** `COMPETITOR-ARTIFACT` — an unfair bench-app (the rr shell did O(N) work the competitor's view-isolated shell doesn't), not an rr cost. Applies to the **VDOM** cohorts (vue, react); the **fine-grained** cohorts (solid `<For>`, svelte runes) don't cascade a shell re-render into the N Links, so they were never affected (inferred N/A — angular uses OnPush + injected route, likewise isolated). Reframes #1483: rr active-links is O(changed) and *wins* once the app is view-isolated like the competitor.
- **Lesson:** a per-cohort "lag" can live entirely in the **bench-app's component structure**. When the competitor uses view-isolation (`RouterView` / `Outlet`) and the rr app inlines a route read over the mounted-link list, the rr app pays an O(N) shell re-render the competitor never does — align the app structure before ruling the adapter slow. (Same class as #1456 mateo — an unequal app measuring different work — but here it was rr's own app doing *more*.)

### svelte nested-switch — `<Link>`-COMPONENT (active-class flip) → **FEATURE-COST**

- **Number:** rr 0.135 vs sv-router 0.095 (+42%, RME ~1%). Bench switches sibling sections `sec.a ↔ sec.b` under a shared layout; both sibling `<Link>`s flip active-class every switch.
- **A/B (same-session, drift-cancelled, n=20):** baseline `<Link>` **0.135** · rr `use:link` (plain-`<a>`, no active-class) **0.092** · sv-router **0.095**.
- **Root cause:** the entire +42% is the **`<Link>` active-class flip on the two sibling links** (~21 µs/link of Svelte component-update: `createSubscriber` invalidate → `finalClassName` `$derived` → class-attr). The active *source* (`createActiveNameSelector`) is already optimal (#1099 — one shared subscription, `areRoutesRelated` pre-filter, diff-before-notify); the cost is the component re-render, not the source.
- **Key positive:** with plain-`<a>`, rr (0.092) **BEATS** sv-router (0.095) — real-router's **RouteView outlet-swap is faster than sv-router's**. The reported loss is 100% the active-class *feature* (auto active styling) that sv-router's plain-`<a>` simply doesn't offer.
- **Verdict:** `FEATURE-COST`. With idiomatic `<Link>` it's red; the loss buys a capability. `use:link` wins for consumers who don't need active styling.
- **Adapter-code A/B — reactivity bridge RULED OUT (2026-07-13):** replaced the `<Link>` active binding's Svelte `createSubscriber` bridge with a direct `$state<boolean>` (the selector writes the value directly, bypassing the lazy invalidation round-trip + per-read `subscribe()`/`getSnapshot()`); rebuilt `@real-router/svelte`; measured nested-switch with idiomatic `<Link>` same-session. **NEW ≡ OLD (0.130–0.135; sv-router 0.095) — no change.** So the ~21 µs/link is **inherent Svelte component-update overhead** (finalClassName re-derive + class-attr + the `<Link>` component's update cycle — identical downstream to either bridge), **NOT** the reactivity bridge. **Not a PR candidate.** With idiomatic `<Link>` this is `STRUCTURAL` (component-vs-plain-`<a>`, same axis as param-nav / link-build); `use:link` is the only win. Do not re-investigate the bridge.

### svelte param-nav — `<Link>`-COMPONENT + IMMUTABLE-STATE → **STRUCTURAL**

- **Number:** rr 0.093 vs sv-router 0.080 (+16%, RME 1.5%). Bench advances `/users/:id` id+1 on the same route (no outlet swap); the "Next" `<Link>`'s `routeParams` change each click.
- **A/B (same-session, drift-cancelled, n=20):** baseline `<Link>` **0.093–0.095** · rr `use:link` **0.085** · sv-router **0.080**.
- **Root cause:** ~8 µs is the `<Link>` component tax (buildHref re-derive on `routeParams` change + component render); ~5 µs is the core `IMMUTABLE-STATE` floor (fresh frozen state per nav; sv-router mutates a signal). `use:link` takes it +16% → +6%, **but does not flip** — the residual is the immutable-state floor, structural.
- **Verdict:** `STRUCTURAL`. Not winnable even with plain-`<a>`; same axes as the rest of the svelte cohort. The immutable-state residual is a `v2-CANDIDATE` (RFC-6 snapshot-store).

### react search-param-scaling — `IMMUTABLE-STATE` eager O(count) floor → **STRUCTURAL** · one-realm measurement fix (2026-07-16)

- **Number:** rr 0.532 vs react-router 0.360 ms @256 params (+48%, RME 4%, n=50); both sub-ms. rr rises O(count) from a ~0.18 ms floor (2.9× floor→256); react-router reads eagerly too but into a lighter structure and stays ~flat.
- **Measurement fix (one-realm):** search-param-scaling was rewritten to **one-realm** measurement (`goto` once → warm the whole count range → measure each `pivot→N` nav in the warm realm; no per-point `land()` reload). This killed the first-point cold-realm bump: `navMsTask@1/@2` **1.20–1.53× → 0.90–1.00× in all 5 cohorts** (@1 now the smallest workload — physically correct). rr react @256 **0.865 (per-point cold) → 0.532 (one-realm)**.
- **Steepness suspicion RESOLVED — was a cold artifact, not adapter cost:** the pre-fix "rr grows steepest on react (3.12×) + angular (3.08×)" was mostly cold-realm inflation. **angular fully converged** — @256 **0.362 ms, now the lowest of all cohorts** (ratio → 2.48×, in the vue/solid pack). react keeps only a **~0.15 ms** real VDOM-re-render residual over the ~0.37 ms vue/solid/angular floor. Not a #1483-class bench-app bug — the searchparams app is view-isolated (leaf renders O(1): one `count·Σchecksum` line).
- **Root cause of the react lag:** rr eagerly materializes all 256 params into fresh immutable state each nav (O(count)); react-router does less per pass. Same `IMMUTABLE-STATE` family as nav-churn / param-nav. rr **WINS the other 4 cohorts** (vue 1.35×, solid 17×, svelte 1.74×, angular 8.6× vs best rival) — the lazy routers explode (TanStack 6–12 ms, solid-router 15 ms); react-router is the lone competitor that also reads eagerly and stays light.
- **New observation (NOT a lag — rr wins):** svelte is now rr's **steepest** search-param cohort (@256 0.566 ms, 3.58× floor, **monotonic**, rme 3.2%) yet rr still WINS svelte (sv-router 0.985, mateo 1.237). **Bench-app equality code-confirmed (2026-07-16):** react/solid/svelte leaves all run the identical `_shared/search-param-spec` `readSearch(Object.entries(params))` over the same 9-`<Link>` nav (not 256) — no svelte-specific extra work. The steeper slope is the **per-param constant of Svelte's `$derived` recompute** — O(count) contribution ~0.40 ms @256 vs react VDOM ~0.35, solid fine-grained ~0.21 (solid's floor dilutes its ratio to 1.4×; svelte's low floor + high slope reads as a late spike). Framework reactivity, not app or router-core. Sub-ms, structural, no issue.
- **gc-per-nav side-effect:** one-realm shifted rr's measured `allocKBPerNav` up ~20% every cohort (warm steady-state; rr code unchanged — react 217→237, vue 92→113, solid 140→160, svelte 91→112, angular 86→106 KB). Story intact (rr lightest in vue/solid/svelte/angular; react-router edges rr 87 vs 237). Deck blurbs synced.
- **Verdict:** `STRUCTURAL`. Sub-ms; eager-immutable materialization is the trade-off that buys the flat floor + O(1) matching. Not winnable without abandoning eager-immutable state.

---

## Detailed root causes (code-traced / issue-backed)

### cold-start (all cohorts) — `EAGER-CORE` → `STRUCTURAL` / `v2-CANDIDATE`

Core eagerly imports + parses its full dependency graph (path-matcher + route-tree + fsm + sources + event-emitter), builds the trie, and runs the initial match + transition at boot — ~3.9 ms over the bare framework, the largest cross-cohort boot gap (#1106). Competitors tree-shake / lazy-load. One-time cost, not per-nav. **v2-CANDIDATE:** the v2 package collapse (9 foundation units → 3–4) + sources absorption would reduce the parsed graph.

### svelte link-build — `<Link>`-COMPONENT → `FEATURE-COST`

rr 12.1 ms vs sv-router 3.2 ms to mount ~1000 links. sv-router uses plain-`<a>`; rr's `<Link>` instantiates a Svelte component per link. Already litigated: #1099 (`<Link>` render overhead), #1247 (per-link `createSubscriber` → shared active-name), #1253 (per-link listeners → event-delegation "to match sv-router's plain-`<a>` lightness") — all closed. **`use:link` is the documented fast path** (README recommends it for link-heavy/paginated pages; ~2× cheaper to mount, and — per the param-nav/nested-switch A/Bs — also cheaper on *update*, not just mount). `<Link>` stays the idiomatic default; the component cost buys ergonomics (auto active-state, hash support).

### nav-churn (solid, svelte) — `IMMUTABLE-STATE` → `STRUCTURAL` / `v2-CANDIDATE`

real-router retains more heap per create→navigate→dispose cycle (svelte +60%, solid +28%; RME 0.0% — deterministic) because it allocates a fresh, frozen `State` per navigation. solid-router/sv-router mutate a signal in place. This is the eager-immutable identity (explicitly kept in the v2 review). **v2-CANDIDATE:** RFC-6 (versioned snapshot-store + total freeze) targets exactly this floor.

### deep-config (all cohorts) — MATCHER isolated → the browser card was render-dominated (2026-07-16, measured)

The browser deep-config times matcher **+ nested-layout RENDER** composition (ms). Isolating the pure matcher (matcher-bench depth sweep — every engine builds the same 90-level nested chain `/deep/l1/../l90`, matched in pure Node, µs) reveals the true class and **debunks two browser-era conclusions**:

- **react-router #15249 is a REAL, catastrophic MATCHER cost, not a render quirk.** The isolated matcher re-flattens + re-ranks the whole 90-deep config every call: a **parabola peaking at depth 60 (9.6 ms), ~4600× real-router's matcher** — same parabola shape (peak @60) as the browser card, a matcher-algorithm signature (render would be monotonic in depth). **The browser "react-router wins deep @90" (1.5 ms) was render**: its matcher @90 is 5953 µs, ~2000× heavier than real-router (2.85 µs). The old `COMPETITOR-ARTIFACT` / `ARTIFACT` verdict was wrong — it is a real, severe react-router matcher cost.
- **real-router's matcher is O(depth) but LIGHT** — 0.6 → 2.8 µs at depth 90 (the trie walks d levels). **TanStack (static-path index) is O(1)** — flat ~1 µs, so it edges real-router at deep (@90 1.04 vs 2.85 µs, 2.7×). This is the *only* real deep-matcher lag: trie-O(depth) vs index-O(1), µs-scale, `STRUCTURAL` (the trie buys prefix-sharing + the full pipeline).
- **vue-router** is µs-competitive (O(depth), 4.7 µs @90). **solid-router (272 µs) and sv-router (200 µs)** are O(depth) with heavy constants — real-router wins their matcher **97× / 72×**. So the browser svelte "rr loses deep +56%" was sv-router's lighter **compiled render**, not its matcher (rr's matcher wins 72×).
- **angular-router — deep HOLDOUT.** The recognizer's recursive nested descent + per-level snapshot/guard work can't be faithfully isolated headless (unlike the flat wide scan). Its deep card keeps the browser full-nav (O(depth), ~5.5 ms @90 vs rr ~1.6 — rr wins there). mateo (svelte) is a holdout for the same reason as wide.
- **Deck:** deep-config now reads the isolated matcher (log µs, uniform with wide-config) for react/vue/solid/svelte; angular falls back to the browser card. Deep matches are µs–ms (not sub-µs like wide), so the runner uses a low iteration floor for the deep sweep.

### table-heap, back-forward — `SCALE-FLOOR` / `FRAMEWORK-NATIVE` → `STRUCTURAL`

- **table-heap** (route-table memory) — **decomposed 2026-07-16 (measured, `node --expose-gc` retained-heap probe):** real-router's router heap scales as `fixed 0.16 MB [O(1): FSM + sources + state] + ~650 B/route [O(routes): route-tree + trie]`. At 10k routes the **O(routes) route-tree + trie is 6.87 MB = 98 % of the router heap** (7.0 MB); the fixed machinery is 2 %, non-scaling. So the `SCALE-FLOOR` cause is **confirmed — it is the eager trie + route-tree** (the price of O(1) *wide* matching + the full pipeline), not the FSM/sources/state. sv-router's compiler-native / lazy structure stores less per route (its lighter 2.3 MB page). (deep-config's matcher is measured separately — see above.)
- **back-forward** (+2%, svelte): real-router's back/forward replay is ~0.206 on **both** svelte and solid — a *core* path cost, identical across adapters; sv-router is 4 µs lighter framework-native. Tiny, ~floor.

---

## Deck-shape artifacts (sub-ms wiggles — non-substantive)

Reviewed 2026-07-16 (deck walk-through). Three sub-ms deck curves show visible wiggles
that are **measurement shape, not router behavior** — logged so the deck's "waves"
aren't re-chased. All three cells are rr **WINS**.

- **solid search-param @32 (0.296 ms)** — a lone point above trend (@16 0.167 → @32
  0.296 → @64 0.199). rme 5.7% (tight), yet **@32 > @64 is non-physical** (32 params
  cannot cost more than 64 doing the same O(count) read). A session-systematic
  per-position blip (V8 tier-up / GC on the 6th sweep slot), which the deck's
  Catmull-Rom smoothing inflates into a "wave" over @16–@64. ~0.1 ms over trend.
- **svelte active-links @64 (0.112 ms)** — bump above @32 (0.085) and @128 (0.082).
  rme 1.3% (very tight) but **@64 > @128 is non-physical**. Same class: a ~30 µs
  per-position blip on an 80–110 µs curve, smoothing-amplified into the hump. rr wins
  (0.101 @256 vs sv-router 0.39).
- **Why tight rme is still an artifact:** rme is the run-to-run spread of the *median*;
  a per-position systematic offset (the same sweep slot every interleaved round) does
  not widen it. The tell is **non-monotonicity on a monotone workload**, not variance —
  and deck smoothing turns one such point into a visible wave. Only *monotonic* rises
  are substantive (e.g. svelte search-param @256 — see the react search-param entry).

---

## How to add an entry

When a new investigation pins a cause:
1. Add a row to the **Summary matrix** (cohort, scenario, margin, cause class, confidence, verdict).
2. If A/B-proven or a notable trace, add a **Detailed** subsection with: the numbers (median + RME + n), the A/B recipe/result or the code-trace (`file:line`), the root cause in one paragraph, and the verdict.
3. Cite the issue/PR if one exists. Keep `inferred` entries clearly marked until an A/B upgrades them.
4. This file is benchmark infra → commit directly to `master`, no changeset.

**A/B recipe (reusable):** build+serve+measure a variant app dir with the harness's `measure()` (no `writeCell` → never contaminates `results/`); run OLD/NEW/OLD/NEW interleaved to cancel drift; the win threshold is the competitor's *same-session* median (absolutes drift ~1 quantum between sessions). Sub-ms verdicts require this — never cross-session.
