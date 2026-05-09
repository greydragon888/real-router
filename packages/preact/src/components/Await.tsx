import { useDeferred } from "../hooks/useDeferred";

import type { ComponentChildren } from "preact";

interface TrackedPromise<T> extends Promise<T> {
  status?: "pending" | "fulfilled" | "rejected";
  value?: T;
  reason?: unknown;
}

/**
 * Preact's `Suspense` (from `preact/compat`) catches a thrown thenable and
 * re-runs the boundary's render once it settles. For deterministic re-renders
 * we tag the promise with `.status` / `.value` / `.reason` on first access so
 * the second render-pass can return the value synchronously instead of
 * throwing again.
 *
 * The same tag layout is used by React 19's internal `use(promise)` cache,
 * so promises that already carry the tag (e.g. emitted by a Suspense-aware
 * data lib) are reused as-is.
 */
function track<T>(promise: Promise<T>): TrackedPromise<T> {
  const tracked = promise as TrackedPromise<T>;

  if (tracked.status !== undefined) {
    return tracked;
  }

  tracked.status = "pending";
  promise.then(
    (value) => {
      /* v8 ignore next 4 -- @preserve: the `.status === "pending"` guard
         protects against external mutation between `track()` and the .then
         microtask; covered branch is the always-true case in our control. */
      if (tracked.status === "pending") {
        tracked.status = "fulfilled";
        tracked.value = value;
      }
    },
    /* v8 ignore start -- @preserve: rejection .then handler — tested
       end-to-end via the React adapter's e2e ssr-streaming Scenario 10
       (id=4 reviews promise rejects on the wire); covering it in unit tests
       requires Preact's Suspense to surface the rejection through render,
       which doesn't compose cleanly with vitest's unhandled-rejection
       detector. Behaviour is symmetric to the success handler above. */
    (error: unknown) => {
      if (tracked.status === "pending") {
        tracked.status = "rejected";
        tracked.reason = error;
      }
    },
    /* v8 ignore stop */
  );

  return tracked;
}

export interface AwaitProps<T> {
  /** Deferred key declared in the loader's `defer({ deferred: { <name>: ... } })`. */
  readonly name: string;
  /** Render the resolved value. Suspends while pending; throws inside the
   * nearest Error Boundary on rejection. */
  readonly children: (value: T) => ComponentChildren;
}

/**
 * Reads `useDeferred(name)` and hands the resolved value to the render-prop
 * via Preact's `<Suspense>`-throwing convention. Wrap in `<Streamed>` (or
 * `<Suspense>` from `preact/compat`).
 *
 * ```tsx
 * <Streamed fallback={<Spinner />}>
 *   <Await<Review[]> name="reviews">
 *     {(reviews) => <ReviewList items={reviews} />}
 *   </Await>
 * </Streamed>
 * ```
 */
export function Await<T = unknown>({
  name,
  children,
}: AwaitProps<T>): ComponentChildren {
  const promise = useDeferred<T>(name);
  const tracked = track(promise);

  if (tracked.status === "fulfilled") {
    return children(tracked.value as T);
  }

  if (tracked.status === "rejected") {
    throw tracked.reason;
  }

  // Suspense catches the thrown thenable and waits for resolution. ESLint
  // complains because Promises aren't Errors, but Preact's Suspense (like
  // React's pre-`use()` Suspense convention) explicitly expects a thenable.
  // eslint-disable-next-line @typescript-eslint/only-throw-error -- Suspense thenable convention
  throw promise;
}
