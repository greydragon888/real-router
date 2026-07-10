import { createSignal, onCleanup } from "solid-js";

import type { RouterSource } from "@real-router/sources";
import type { Accessor } from "solid-js";

export function createSignalFromSource<T>(
  source: RouterSource<T>,
): Accessor<T> {
  // Mini-sprint E.5 (audit-5 §4.2 #7) — defensive init-phase snapshot
  // reads. A throwing `getSnapshot()` during construction would
  // propagate up through `createSignal<T>(...)` (or the post-subscribe
  // re-sync below) into the reactive owner, tearing down the entire
  // RouterProvider subtree (and any siblings sharing the owner). Catch
  // + log + fall back to `undefined` (initial) or skip-update (post-
  // subscribe re-sync) so the accessor still constructs; the next
  // emit refreshes the value.
  //
  // Post-init emit-time throws are NOT wrapped — they bubble to Solid's
  // `<ErrorBoundary>` (or surface as unhandled errors in dev) so
  // genuine source bugs aren't silently masked.
  let initial: T;

  try {
    initial = source.getSnapshot();
  } catch (error) {
    console.error(
      "[real-router] createSignalFromSource: initial getSnapshot threw — accessor defaulting to undefined.",
      error,
    );
    initial = undefined as T;
  }

  const [value, setValue] = createSignal<T>(initial);

  // `sync` is a stable reference (defined once at outer scope) so the
  // subscribe callback below does not re-allocate it per emit. Solid's
  // `setValue(fn)` treats fn as an updater `(prev) => next`; our updater
  // ignores `prev` and reads the latest snapshot fresh, which gives a
  // function-form micro-allocation cost (one extra fn call per emit) BUT
  // a much smaller TS surface than the `setValue(value)` direct form —
  // that overload is typed `Exclude<T, Function>`, requiring per-call
  // `as Exclude<T, (...args: never[]) => unknown>` casts for generic T.
  // The micro-opt is not worth the cast complexity.
  // See §8.2 audit note.
  const sync = (): T => source.getSnapshot();

  const unsubscribe = source.subscribe(() => {
    setValue(sync);
  });

  // Re-read after subscribe — a defensive safety net, NOT a notification fix.
  // The earlier rationale here ("the source reconciles in onFirstSubscribe but
  // the listener isn't notified, so sync manually") was WRONG: BaseSource adds
  // the listener to #listeners BEFORE running onFirstSubscribe, so a reconciling
  // source (createRouteNodeSource, and createRouteSource since sources 0.9.0 —
  // #765) DOES deliver that update to us — the setValue here is then a no-op
  // (signal equality check). Keep it anyway as defense-in-depth: it costs one
  // equality-checked no-op, and it shields us from any source whose snapshot is
  // fresh at subscribe time without a separate emit. Do NOT "optimize it away"
  // by trusting a notification that some hypothetical source might not send.
  // Wrapped because this is still init-phase: a throw here ALSO tears down the
  // owner, same as the initial read above.
  try {
    setValue(sync);
  } catch (error) {
    console.error(
      "[real-router] createSignalFromSource: post-subscribe getSnapshot threw — accessor retains initial value.",
      error,
    );
  }

  onCleanup(() => {
    unsubscribe();
  });

  return value;
}
