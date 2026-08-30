// packages/core/src/utils/ingest.ts
//
// One discipline for the records core BUILDS under a key it did not CHOOSE.
//
// Two halves, and they answer different questions — a reader who takes them for
// one primitive will draw the wrong conclusion from either:
//
//   `emptyRecord` / `publishRecord` (#1825) — a record with no prototype for the
//     BUILD, handed out plain. Used where the record is core's alone:
//     `buildParamMeta`, the segment-meta walk.
//   `putField` / `copyFields` (#1852) — a guarded WRITE for the records that
//     cannot be prototype-less because they are published, read on every render,
//     or belong to someone else. Used across core and, through
//     `@real-router/core/utils`, by four plugins.
//     ⚠ The site COUNTS deliberately do not live here. This comment carried
//     "twenty-one in core, fourteen across four plugins" and both halves were
//     wrong (22 and 13, measured) — a second copy of a number `CLAUDE.md`
//     already calls descriptive-not-contract. The count lives in `CLAUDE.md`
//     ("The WRITE side of the same rule"); the CONTRACT is the derived set in
//     `tests/functional/computed-key-write-authority-1852.test.ts`.
//
// ⚠ Neither decides whether a key is PUBLISHED. `__proto__` stays out of
// `state.params` / `state.search` by a separate skip at the channel copy sites
// in `helpers.ts`, and stays IN a route's custom fields and a plugin's context
// namespace, because those are not containers a consumer merges. See `putField`'s
// docblock for that split.
//
//   `concealUnsafeKey` (#1957) is the one member of this file that DOES decide
//     that — for exactly one record, `buildMeta`'s, which core both hands out
//     and reads back by key. It withholds the name from ENUMERATION rather than
//     removing it, because removing it is a measured behaviour loss there. The
//     doors that only hand a container OUT drop the key instead
//     (`dropUnsafeKey`, `helpers.ts`).
//
// ⚠ The rest are WRITE-side primitives only, and the boundary is deliberate. A
// READ-side primitive that walks a caller's prototype chain was written here,
// wired, measured — and removed: `CLAUDE.md` "Supported Input Shapes" settles
// that axis already ("own enumerable properties only", owner decision
// 2026-08-18), and core is the layer that DEGRADES on a violation while
// `@real-router/validation-plugin` is the layer that reports it. A primitive
// that honoured inherited keys would have made core contradict its own canon,
// and it additionally admitted the ambient `Object.prototype` — the #1840
// class, introduced by the fix.
//
// So what is left is the half the canon does not cover: what happens when core
// writes into a record of its own under a key it did not choose.

import { UNSAFE_KEY } from "../constants";

const objectEntries = Object.entries;

/**
 * The target discipline: a record with NO prototype.
 *
 * ⚑ This one line closes two axes at once, which is why it is a primitive and
 * not an idiom. #1856 tabulates them as a structural trade — a key-by-key copy
 * fixes `"__proto__"` but turns a `[[DefineOwnProperty]]` into a `[[Set]]`, so
 * an ambient accessor starts throwing — and calls the conflict unavoidable. It
 * is unavoidable only while the target inherits from `Object.prototype`:
 *
 *   - `"__proto__"` (#1825, #1794, #1809) is an ordinary key here, because the
 *     magic accessor lives on `Object.prototype` and this object has none.
 *   - an ambient accessor named `id` / `page` / `tab` (#1852) cannot hijack the
 *     write for the same reason. #1852 notes the key's provenance is
 *     irrelevant — `SegmentMatcher` writes a name from the ROUTE TABLE and
 *     throws just the same — so a name-based skip cannot close it and this can.
 */
export function emptyRecord<V>(): Record<string, V> {
  return Object.create(null) as Record<string, V>;
}

/**
 * Hand a privately-built record out with the ORDINARY prototype, keeping every
 * own key — including a literal `"__proto__"`.
 *
 * Discovered by measurement, not designed: wiring `emptyRecord` into
 * `buildParamMeta` alone reds **21** existing tests, all of the shape
 * `expected { id: 'url' } to strictly equal { id: 'url' }` — identical content,
 * different prototype, because `toStrictEqual` compares prototypes and
 * `paramTypeMap` is published through `getPluginApi(router).getTree()`. A
 * prototype-less record is not a drop-in at a published surface.
 *
 * The spread is what makes this work rather than undo it: it
 * `[[DefineOwnProperty]]`s, so an own `"__proto__"` carried on the private
 * record lands as an ordinary own key here (measured: own keys
 * `["__proto__","keep"]`, value intact, prototype back to `Object.prototype`).
 * Writing that same key into a fresh `{}` with `[[Set]]` loses it entirely
 * (measured: own keys `[]`) — which is the defect the private record exists to
 * avoid.
 *
 * So the rule is: **build private, publish plain.** The window in which the
 * ambient-accessor hazard (#1852) could bite is the build, and the build never
 * touches `Object.prototype`.
 */
export function publishRecord<V>(source: Record<string, V>): Record<string, V> {
  return { ...source };
}

/**
 * Captured at module load for the reason `helpers.ts` gives for `freeze` /
 * `hasOwn` / `objectKeys`: this is the operation {@link putField} writes
 * through, so a guard reading it late would be reading whatever an application
 * had re-pointed it to.
 */
const defineProperty = Object.defineProperty;
const hasOwn = Object.hasOwn;

/**
 * Withhold `UNSAFE_KEY` from ENUMERATION on a record core hands out AND reads
 * back by key (#1957).
 *
 * ⚑ The hazard is the CONSUMER's merge, not core's own write. `Object.assign`
 * and a `for…in` copy `[[Set]]` each own ENUMERABLE key on the TARGET, where
 * `Object.prototype`'s `"__proto__"` accessor replaces that target's prototype
 * instead of adding an entry.
 *
 * ⚠ A SPREAD is not in that list, and an earlier revision of this docblock said
 * it was. `{ ...source }` performs `CreateDataProperty`, i.e.
 * `[[DefineOwnProperty]]`, which never reaches an inherited accessor — measured
 * on the poisoned bag, on a null-prototype carrier and through a pass-through
 * Proxy, a spread swaps in none of the three. #1823 had the list right
 * ("`Object.assign` or a `for…in` copy") and this widened it by mistake. The
 * hazard is real and narrower than that sentence claimed.
 *
 * So the SOURCE's own prototype decides nothing either — measured, an
 * `Object.create(null)` source swaps the target exactly the same — and the only
 * two fixes are removing the key or removing it from enumeration.
 *
 * ⚠ **Dropping is not a milder fix here, it is a WRONG one.** The route-meta
 * record is core's working table: `segmentParamsEqual` reads `meta[segmentName]`
 * on every navigation, so with the entry gone the read reaches the INHERITED
 * accessor and answers `Object.prototype` — an object, whose `Object.keys` is
 * `[]`, so the segment reports "params unchanged". Measured end to end on a
 * route named `__proto__`: `/p/1` → `/p/2` activates `["__proto__"]` today and
 * `[]` with the entry deleted. Core accepts that name (#1801), so the loss is
 * real and silent.
 *
 * Non-enumerable keeps the read exact for core AND for a consumer asking by
 * key, while `Object.assign` / a spread / `for…in` skip it — measured, all
 * three.
 *
 * ⚠ NOT applied by {@link publishRecord} itself. Its other caller is
 * `buildParamMeta`, whose map core ENUMERATES (`Object.keys` in
 * `segmentParamsEqual`, `for…in` in `hasAnyParam`) and which is not a swap
 * primitive anyway: a param's value is the string `"url"` / `"query"`, and the
 * inherited setter ignores primitives.
 *
 * Returns the input untouched, with no descriptor write, when the key is absent
 * — which is every ordinary route.
 */
export function concealUnsafeKey<V>(
  record: Record<string, V>,
): Record<string, V> {
  if (!hasOwn(record, UNSAFE_KEY)) {
    return record;
  }

  defineProperty(record, UNSAFE_KEY, {
    value: record[UNSAFE_KEY],
    writable: true,
    enumerable: false,
    configurable: true,
  });

  return record;
}

/**
 * Write one field of a record core BUILDS under a key it did not choose.
 *
 * ⚑ The rule this exists to enforce: **a caller's object contributes DATA, and
 * nothing else.** No trap, no accessor, no inherited member of a bag handed to
 * the router may change what the router ends up holding — which is what
 * "treat it as a pure dictionary" means on the WRITE side. `Object.keys` and
 * the one-read-per-key discipline (#1854 / #1899) already say it on the read
 * side; this is the other half.
 *
 * Plain `target[key] = value` cannot say it. `[[Set]]` walks the prototype
 * chain first, so a key that resolves to an accessor or a non-writable data
 * property up there is HIJACKED — the write dispatches into application code
 * (or is silently dropped in sloppy mode, and throws in a module). The key's
 * provenance is irrelevant: `SegmentMatcher` writes a name straight off the
 * ROUTE TABLE, so `id` / `tab` / `page` are as exposed as `__proto__` (#1852),
 * and a name-based skip therefore cannot close it.
 *
 * `Object.defineProperty` CAN say it — it ignores the chain entirely — but it
 * measures ~100 ns per field against ~0 for a store, which is why #1852 priced
 * it as unaffordable on a path that runs per navigation and per `<Link>`
 * render.
 *
 * So the write is guarded rather than replaced: **ask the chain first, and pay
 * only where it answers.** In a pristine environment `in` answers `false` for
 * every name an application routes under, so the store is taken and nothing is
 * paid. It covers both halves of the hazard, which a `__proto__` name test does
 * not: an accessor (getter-only THROWS, getter+setter silently diverts the
 * value) and a **non-writable** data property. Verified on all four shapes plus
 * the overwrite cases.
 *
 * ⚠ It asks `key in target`, NOT `key in Object.prototype`, and the difference
 * is the whole robustness of the primitive rather than a style choice. The
 * cheaper form is right only while every target is a fresh `{}`, i.e. while its
 * chain IS `Object.prototype` — measured, a target inheriting the accessor from
 * anywhere else walks straight past that predicate and throws. Asking the
 * object
 * being written to cannot be wrong for any target. Measured cost of the
 * difference, measured when the two forms were compared directly: a wash on
 * every arc, bought for a predicate with no precondition. ⚠ Those figures
 * predate both the `!hasOwn` term and the restored channel skips, and the
 * number
 * that supersedes them is below — the whole guard sits under the noise floor,
 * so
 * the choice between the two predicates cannot be visible in it.
 *
 * ⚑ **`&& !hasOwn`, and that second term is not an optimisation — it is what
 * keeps this a guarded WRITE instead of a redefinition.** When the key is
 * already an OWN property of the target, `[[Set]]` finds it and never consults
 * the chain, so a plain store is both safe AND semantically right there.
 * `defineProperty` is not: it replaces the whole DESCRIPTOR with this
 * function's
 * fixed one, and three consequences of that were measured before the term was
 * added.
 *
 *   - It **throws where a plain store works**: a `configurable: false` own key
 *     (a sealed target, an array's `length`) refuses `defineProperty` while
 *     accepting an assignment.
 *   - It **silently unlocks**: an own `writable: false` key was overwritten and
 *     came back writable, and an own `enumerable: false` key came back
 *     enumerable — a "guarded write" that also removes the guard.
 *   - It **changed a shipped shape**, which is how this was caught rather than
 *     reasoned about. `RouterError`'s own `stack` is a non-enumerable accessor;
 *     `wrapSyncError` passes `stack` through here, so every error built from a
 *     thrown one gained an own enumerable `stack`. `Object.keys(err)` changed,
 *     and two errors differing only in stack stopped comparing equal under
 *     `isDeepStrictEqual` / `toEqual`. The two arms of `rethrowAsRouterError`
 *     disagreed with each other, because one of them assigns.
 *
 * `in` answers `false` for a fresh bag's new key and short-circuits, so
 * `hasOwn`
 * runs only on the rare branch it disambiguates. ⚠ That short-circuit is why an
 * earlier revision called the hot path "untouched"; it is not — one dictionary
 * lookup per written field is the price, and it is measured below.
 *
 * ⚠ The alternative that looks equivalent and is not: a prototype-less target.
 * It also closes the axis, and it costs far MORE, because the price is not on
 * the write at all — V8 puts such an object in dictionary mode, so every later
 * READ of the bag pays. Re-measured on the SHIPPED tree rather than carried
 * over from an earlier one: `buildPath` goes **+65.4 %** (one path slot) and
 * **+36.2 %** (slot + query). `{ __proto__: null }` as a literal is no better
 * (76 ns vs 70 ns for `Object.create(null)`, against 7.5 ns plain).
 *
 * ⚑ **The guard costs, and two earlier revisions of this docblock denied it.**
 * The last one said "NOT MEASURABLE" on medians-of-five whose A/A floors were
 * 5-6 %; on a quiet machine this harness floors at 0.1-1.7 %, and at that
 * resolution the cost is plain. Same-session A/B, ALTERNATING PROCESSES (two
 * copies of the module in one process is not a valid A/B), medians of 20 pairs,
 * against the SHIPPED bundle rather than `src`, each arc's own A/A floor in
 * brackets:
 *
 *     buildPath, splat param     232.4 -> 260.3 ns   +12.0 %  (0.7 %)
 *     isActiveRoute, exact       117.5 -> 125.4 ns    +6.8 %  (0.1 %)
 *     matchPath, path params     664.0 -> 693.8 ns    +4.5 %  (0.8 %)
 *     buildPath, static           97.5 ->  99.2 ns    +1.7 %  (1.7 %)
 *     buildPath, one path slot   145.0 -> 140.5 ns    -3.1 %  (1.0 %)
 *     isActiveRoute, sibling      38.4 ->  38.3 ns    -0.3 %  (0.3 %)
 *
 * Isolated by building the tree with the predicate replaced by `false`: it is
 * worth -6.1 % on the splat arc and -7.5 % on the exact one, i.e. the whole of
 * the regression there; the rest of `matchPath`'s is `withoutUnsafeKey`
 * (#1904), -2.1 %.
 *
 * ⚠ The old claim was less a bad measurement than a measurement of the WRONG
 * ARCS. `warm-params` and the sibling arm genuinely do not move — those are the
 * two it sampled — while the splat and exact arms do. Sampling what does not
 * move and generalising to "not measurable" is the same trap the reachability
 * arguments elsewhere in this file are written against.
 *
 * The price is ACCEPTED, deliberately, and three cheaper forms were measured
 * and rejected before accepting it:
 *
 *   - asking a captured `Object.prototype` instead of the target, so the `in`
 *     receiver is monomorphic: every arc inside the A/A floor. The cost is the
 *     dictionary lookup, not who is asked.
 *   - a prototype-less accumulator in `normalizeChannel` published through
 *     `publishRecord`: **+134 % … +284 %** — the dictionary-mode price above,
 *     now measured end to end rather than argued.
 *   - an optimistic plain store repaired afterwards (`hasOwn` + `try`/`catch`):
 *     -3.5 % and -2.8 % on two arcs but **+8.3 %** on a third, and it re-opens
 *     the descriptor question `&& !hasOwn(target, key)` exists to close.
 *
 * ⚠ **CodSpeed reports this change at -13.83 %, and that is not the shipped
 * cost.** The gap is measured, not assumed. The suite runs
 * `tsx tests/benchmarks/run.ts` — against `src`, unbundled — so its flamegraph
 * carries ESM module-namespace getter frames (`get (ingest.ts)`, 2.67 % of one
 * arc) that the bundle does not have: `grep -c 'get: ()' dist/esm/index.mjs` is
 * 0. `Simulation` mode additionally over-counts instructions a superscalar CPU
 * hides. On the worst-reported arc the sign inverts — -17.25 % simulated,
 * -3.1 % (i.e. FASTER) in the bundle.
 *
 * A prototype-less channel additionally changes a PUBLISHED shape:
 * `state.params` would stop inheriting from `Object.prototype`, which reds
 * **352 tests in 17 packages**, none of them for a behavioural reason.
 *
 * ⚠ That count was published as "263 in 15" and is a RE-MEASUREMENT, not a
 * drift: the first figure came from running the affected packages one at a time
 * partway through the change, and both halves of it were low. A full-monorepo
 * run (10 553 tests) gives 352/17 for a prototype-less channel including the
 * `EMPTY_PARAMS` / `EMPTY_SEARCH` singletons, and 286/17 for the accumulators
 * alone — the package count is 17 either way, so it was never a question of
 * which sites to mutate.
 *
 * The qualitative half held up and is the load-bearing one: all 352 are
 * `AssertionError`, zero are thrown; 336 are `toStrictEqual` and 16 are
 * explicit
 * prototype pins; and NO `toEqual` / `toMatchObject` cell moved, which is the
 * internal control that only the prototype axis shifted.
 *
 * ⚑ `defineProperty` also makes `__proto__` an ordinary own key rather than a
 * write that swaps the target's prototype — which is why the `claim.write`
 * (#1191), `assignParam` (#855) and custom-field (#1788) special cases could be
 * replaced by this one primitive instead of kept beside it.
 *
 * ⚠ **It does NOT decide whether that key is PUBLISHED, and the two questions
 * were briefly conflated here.** The channel copy sites in `helpers.ts` still
 * drop `__proto__` before it reaches `state.params` / `state.search`, and that
 * skip is orthogonal to this primitive: a bag core hands BACK carrying the key
 * is a prototype-swap primitive for any consumer that merges it with
 * `Object.assign` — measured, `?__proto__` alone yields `null` and
 * `?__proto__=1&__proto__=2` an array, and the inherited setter accepts both.
 * `getDependenciesApi.getAll()` deletes the same key for the same reason and in
 * those words. Where the record does NOT escape to a merging consumer — a
 * route's custom fields, a plugin's context namespace — the key stays as data,
 * which is what #1788 and #1191 are about.
 */
export function putField<V>(
  target: Record<string, V>,
  key: string,
  value: V,
): void {
  if (key in target && !hasOwn(target, key)) {
    defineProperty(target, key, {
      value,
      writable: true,
      enumerable: true,
      configurable: true,
    });
  } else {
    target[key] = value;
  }
}

/**
 * {@link putField} for a whole source record — what `Object.assign` would do,
 * without the hazard.
 *
 * ⚑ It exists because `Object.assign` IS the hazard, written in a form a census
 * keyed on `dst[key] = value` cannot see. It copies with `[[Set]]`, one key at
 * a
 * time, so every argument in {@link putField}'s docblock applies to it verbatim
 * — and it is the reason this class needed a second look after the obvious
 * sweep: the matcher's junction walk builds `childParams` with a computed-key
 * literal (safe: that DEFINES) and then commits it with `Object.assign` (not).
 * Measured with an ambient setter under a route's own param name, the route
 * still MATCHED and `state.params` came back empty — the URL's parameter gone,
 * with no error anywhere.
 *
 * `Object.entries` for the walk: it hands back the value it already read, so
 * there is exactly ONE read per key and no window for a drifting accessor
 * between the test and the use (#1899). It is also the idiom the sibling copy
 * loops use.
 *
 * ⚠ **Two things it does NOT buy, both measured after an earlier revision of
 * this docblock claimed them.**
 *
 *   - It is **not** a filter against a lying Proxy source. `ownKeys` is asked
 *     first, so a key that list does not contain cannot appear — but a source
 *     whose `ownKeys` DOES name a phantom and whose descriptor trap calls it
 *     enumerable gets that phantom copied, identically to `Object.assign`. The
 *     #1854 protection is narrower than "the trap is never consulted".
 *   - It is **not** a drop-in for `Object.assign`. `Object.entries` is
 *     string-keyed, so own enumerable SYMBOL entries are dropped where
 *     `Object.assign` copies them. That matches core's stated policy for the
 * channels ("symbols are dropped, always") and is a real behaviour change at
 *     the one call site that used to be an `Object.assign`
 *     (`persistent-params`' factory). ⚠ It also disagrees with `publishRecord`
 *     two functions up, which spreads and therefore keeps symbols — the same
 *     internal split `helpers.ts` records as the #1792 defect.
 */
export function copyFields<V>(
  target: Record<string, V>,
  source: Record<string, V>,
): void {
  for (const [key, value] of objectEntries(source)) {
    putField(target, key, value);
  }
}
