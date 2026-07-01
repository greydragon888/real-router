import { RxObservable } from "../RxObservable";

import type { Operator } from "../types";

export function takeUntil<T>(notifier: RxObservable<unknown>): Operator<T, T> {
  return (source: RxObservable<T>) =>
    new RxObservable<T>((observer) => {
      // eslint-disable-next-line prefer-const -- assigned after usage in complete()
      let sourceSubscription: ReturnType<typeof source.subscribe> | undefined;
      // eslint-disable-next-line prefer-const -- assigned after usage in complete()
      let notifierSubscription:
        ReturnType<typeof notifier.subscribe> | undefined;
      let completed = false;

      const complete = () => {
        /* v8 ignore start -- defensive: race condition guard */
        // Stryker disable next-line ConditionalExpression,BlockStatement: equivalent — defensive double-completion guard (#773); the eager unsubscribe below closes the race so complete() never re-enters with completed===true (v8-ignored; injection-proven: removing it leaves the suite green).
        if (completed) {
          return;
        }
        /* v8 ignore stop */

        // Stryker disable next-line BooleanLiteral: equivalent — the flag is redundant for this path: the unsubscribe below drops the source, so no later value reaches the L79 `if (!completed)` gate (injection-proven green).
        completed = true;

        // sourceSubscription may be undefined if notifier emits synchronously
        // Stryker disable next-line BlockStatement: equivalent — redundant with the main teardown: `observer.complete?.()` finalizes the downstream subscription, which runs the `return () => { source.unsubscribe(); … }` teardown anyway (injection-proven green).
        if (sourceSubscription) {
          sourceSubscription.unsubscribe();
        }
        // notifierSubscription may be undefined if we're inside notifier.subscribe() call
        // Stryker disable next-line BlockStatement: equivalent — redundant with the main teardown (same as the source unsubscribe above) — finalize releases the notifier (injection-proven green).
        if (notifierSubscription) {
          notifierSubscription.unsubscribe();
        }

        observer.complete?.();
      };

      notifierSubscription = notifier.subscribe({
        next: () => {
          complete();
        },
        error: (error) => {
          /* v8 ignore start -- defensive: notifier error after completion */
          // Stryker disable next-line ConditionalExpression,BlockStatement: equivalent — defensive guard against an error arriving after completion; the notifier is unsubscribed on the first terminal so it cannot re-fire (v8-ignored; injection-proven green).
          if (completed) {
            return;
          }
          /* v8 ignore stop */

          completed = true;

          // sourceSubscription may be undefined if notifier errors synchronously
          if (sourceSubscription) {
            sourceSubscription.unsubscribe();
          }
          // notifierSubscription may be undefined when erroring synchronously —
          // released by the post-subscribe `if (completed)` block below (#773)
          if (notifierSubscription) {
            notifierSubscription.unsubscribe();
          }

          observer.error?.(error);
        },
      });

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- defensive
      if (completed) {
        // The notifier emitted/errored synchronously inside its own subscribe,
        // so complete()/error ran before `notifierSubscription` was assigned and
        // the wrapper exposes no teardown (early return). Release the now-assigned
        // notifier subscription here so it does not dangle forever (#773).
        notifierSubscription.unsubscribe();

        return;
      }

      sourceSubscription = source.subscribe({
        next: (value) => {
          /* v8 ignore start -- defensive: emission after completion */

          if (!completed) {
            observer.next?.(value);
          }
          /* v8 ignore stop */
        },
        error: (error) => {
          /* v8 ignore start -- defensive: race condition guard */
          // Stryker disable next-line ConditionalExpression,BlockStatement: equivalent — defensive guard against a source error after the notifier already completed; completed===true is unreachable on entry here because completion unsubscribes the source first (v8-ignored; injection-proven green).
          if (completed) {
            return;
          }
          /* v8 ignore stop */

          completed = true;

          // takeUntil is now inert (completed=true drops every later source value),
          // so release the source — exactly as the notifier-emit / notifier-error
          // branches do. sourceSubscription is undefined only when the source errors
          // synchronously; the post-subscribe block below releases it in that case.
          if (sourceSubscription) {
            sourceSubscription.unsubscribe();
          }

          // notifierSubscription is always defined here (notifier subscribes before source)
          notifierSubscription.unsubscribe();

          observer.error?.(error);
        },
        complete: () => {
          complete();
        },
      });

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- defensive
      if (completed) {
        // The source completed/errored synchronously inside its own subscribe, so the
        // handler ran before `sourceSubscription` was assigned and could not release it.
        // complete() already closed the source (no-op here), but a non-terminal error
        // leaves it open — release the now-assigned subscription so it does not dangle (#877).
        sourceSubscription.unsubscribe();
      }

      return () => {
        // Both guaranteed defined: notifier subscribes first, early return above on
        // sync notifier complete/error, source subscribes after.
        sourceSubscription.unsubscribe();
        notifierSubscription.unsubscribe();
      };
    });
}
