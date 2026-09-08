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
        /* v8 ignore start -- reachable but observably inert; see the disable below */
        // Stryker disable next-line ConditionalExpression,BlockStatement: equivalent — a notifier emitting twice inside its own subscribe DOES re-enter here, because `notifierSubscription` is unassigned on the first pass and the eager unsubscribe cannot fire. Dropping the guard stays unobservable: the second `observer.complete?.()` reaches a downstream subscription that `safeComplete` already closed (#773).
        if (completed) {
          return;
        }
        /* v8 ignore stop */

        // Stryker disable next-line BooleanLiteral: equivalent — `observer.complete?.()` below closes the downstream subscription, so a later source value is dropped by `RxObservable.subscribe`'s own `closed` check whatever this flag says.
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
          // A notifier that errors twice inside its own subscribe re-enters
          // here: `notifierSubscription` is unassigned on the first pass, so
          // nothing released it, and `error` is non-terminal at the
          // `RxObservable` layer. takeUntil is inert after the first terminal,
          // so the second error is dropped rather than forwarded.
          if (completed) {
            return;
          }

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

          // Stryker disable next-line OptionalChaining: equivalent — see the note on `observer.next?.()` above: a subscribeFn is only ever called by `RxObservable.subscribe`, which always passes all three handlers.
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
          // A source that errors and then emits reaches here with `completed`
          // already true: `error` does not close an `RxObservable`, and a
          // synchronous error leaves `sourceSubscription` unassigned, so
          // nothing unsubscribed the source.
          if (!completed) {
            // Stryker disable next-line OptionalChaining: equivalent — `RxObservable.subscribe` is the only caller of a subscribeFn and always passes all three handlers, so `observer.next` is never absent inside an operator (probed across every public door).
            observer.next?.(value);
          }
        },
        error: (error) => {
          // A source that errors twice inside its own subscribe re-enters here
          // for the same reason as the notifier arm above: `sourceSubscription`
          // is unassigned on the first pass, and `error` is non-terminal.
          if (completed) {
            return;
          }

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

          // Stryker disable next-line OptionalChaining: equivalent — see the note on `observer.next?.()` above: a subscribeFn is only ever called by `RxObservable.subscribe`, which always passes all three handlers.
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
