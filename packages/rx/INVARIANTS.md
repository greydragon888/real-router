# Invariants

> Property-based invariants verified via [fast-check](https://fast-check.dev/). See `tests/property/` for implementations.

## Operators

| #   | Invariant                             | Description                                                                                                                                                        |
| --- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Functor law                           | `pipe(map(f), map(g))` produces the same output as `pipe(map(x => g(f(x))))`. Composing two maps is equivalent to a single fused map.                              |
| 2   | Filter correctness                    | `filter(pred)` only passes values where `pred(v) === true`. No value satisfying the predicate is suppressed, and no value failing it is passed through.            |
| 3   | Distinct                              | `distinctUntilChanged()` never emits two strictly equal consecutive values. The default comparator uses `===`.                                                     |
| 4   | Distinct with custom comparator       | `distinctUntilChanged(eq)` uses the provided equality function to compare consecutive values. No two consecutive emitted values are equal by that comparator.      |
| 5   | Distinct reference equivalence        | `distinctUntilChanged()` output is identical to `values.filter((v, i) => i === 0 \|\| v !== values[i - 1])`. The operator performs exact sequential deduplication. |
| 6   | Distinct-custom reference equivalence | `distinctUntilChanged(eq)` output is identical to sequential dedup using the same comparator: `values.filter((v, i) => i === 0 \|\| !eq(values[i - 1], v))`.       |
| 7   | Identity                              | `pipe(map(x => x))` preserves all values unchanged. Mapping with the identity function is equivalent to no transformation.                                         |

## Subscription

| #   | Invariant               | Description                                                                                                                                                                       |
| --- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Delivery                | Every value emitted by the source is delivered to all active subscribers. Each independent subscription receives the full sequence.                                               |
| 2   | Ordering                | Values are delivered to each subscriber in the same order they were emitted by the source.                                                                                        |
| 3   | Unsubscribe             | After calling `unsubscribe()`, no further values are delivered to that subscriber. Values emitted after unsubscription are silently dropped for that subscription.                |
| 4   | Cold behavior           | Each `subscribe()` call triggers an independent execution of the subscribe function. Two subscriptions to the same observable each receive the full value sequence independently. |
| 5   | Complete stops delivery | After `complete()` is called, no further values emitted via `next()` are delivered. The `closed` flag prevents all subsequent emissions.                                          |

## Pipe Composition

| #   | Invariant            | Description                                                                                                                                               |
| --- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Associativity        | `source.pipe(a, b, c)` produces the same result as `source.pipe(a, b).pipe(c)` and `source.pipe(a).pipe(b, c)`. Operator grouping does not affect output. |
| 2   | Empty pipe           | `obs.pipe()` with no operators returns the exact same observable reference (`===`). No new object is allocated.                                           |
| 3   | Single-operator pipe | `source.pipe(op)` produces the same output as `op(source)`. Pipe with a single operator is equivalent to direct operator application.                     |

## Beyond-RFC Invariants

| #   | Invariant               | Description                                                                                                                                                          |
| --- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | takeUntil passthrough   | When the notifier never emits, all source values pass through unchanged. `takeUntil` is transparent for silent notifiers.                                            |
| 2   | takeUntil cutoff        | After the notifier emits, no further source values are delivered. Values emitted before the notifier are preserved; values emitted after are dropped.                |
| 3   | takeUntil sync          | If the notifier emits synchronously during subscription, no source values are delivered. The stream completes before the source is subscribed.                       |
| 4   | Filter idempotence      | `filter(p) ∘ filter(p) ≡ filter(p)`. Applying the same predicate twice produces the same result as applying it once.                                                 |
| 5   | Distinct idempotence    | `distinct() ∘ distinct() ≡ distinct()`. Applying `distinctUntilChanged` twice produces the same result as once — an already-deduplicated stream is unchanged.        |
| 6   | Map preserves length    | `map(f)` emits exactly as many values as the source. Every source value produces exactly one output value (1:1 mapping).                                             |
| 7   | debounceTime validation | `debounceTime(duration)` accepts non-negative finite numbers. Negative, `NaN`, or infinite durations throw `RangeError` synchronously before returning the operator. |

## Test Files

| File                                        | Invariants | Category                                                                                                                              |
| ------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/property/operators.properties.ts`    | 16         | Operator laws: functor, filter, distinct (+ reference equivalence), identity, takeUntil, idempotence, length, debounceTime validation |
| `tests/property/subscription.properties.ts` | 5          | Subscription: delivery, ordering, unsubscribe, cold behavior, complete stops delivery                                                 |
| `tests/property/pipe.properties.ts`         | 3          | Pipe composition: associativity, empty-pipe identity, single-operator equivalence                                                     |
| `tests/property/helpers.ts`                 | —          | Shared arbitraries and observable factory helpers                                                                                     |
