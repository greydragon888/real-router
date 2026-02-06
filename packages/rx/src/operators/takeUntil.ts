import { RxObservable } from "../RxObservable";

import type { Operator } from "../types";

export function takeUntil<T>(notifier: RxObservable<unknown>): Operator<T, T> {
  return (source: RxObservable<T>) =>
    new RxObservable<T>((observer) => {
      // eslint-disable-next-line prefer-const -- assigned after usage in complete()
      let sourceSubscription: ReturnType<typeof source.subscribe> | undefined;
      // eslint-disable-next-line prefer-const -- assigned after usage in complete()
      let notifierSubscription:
        | ReturnType<typeof notifier.subscribe>
        | undefined;
      let completed = false;

      const complete = () => {
        /* v8 ignore start -- defensive: race condition guard */
        if (completed) {
          return;
        }
        /* v8 ignore stop */

        completed = true;

        // sourceSubscription may be undefined if notifier emits synchronously
        if (sourceSubscription) {
          sourceSubscription.unsubscribe();
        }
        // notifierSubscription may be undefined if we're inside notifier.subscribe() call
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
          if (completed) {
            return;
          }
          /* v8 ignore stop */

          completed = true;

          // sourceSubscription may be undefined if notifier errors synchronously
          if (sourceSubscription) {
            sourceSubscription.unsubscribe();
          }

          observer.error?.(error);
        },
      });

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- defensive
      if (completed) {
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
          if (completed) {
            return;
          }
          /* v8 ignore stop */

          completed = true;

          // notifierSubscription is always defined here (notifier subscribes before source)
          notifierSubscription.unsubscribe();

          observer.error?.(error);
        },
        complete: () => {
          complete();
        },
      });

      return () => {
        // Both guaranteed defined: notifier subscribes first (line 37),
        // early return on line 60 if sync complete/error, source subscribes after (line 64)
        sourceSubscription.unsubscribe();
        notifierSubscription.unsubscribe();
      };
    });
}
