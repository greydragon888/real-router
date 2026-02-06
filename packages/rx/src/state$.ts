import { events } from "@real-router/core";

import { RxObservable } from "./RxObservable";

import type { Router, State, SubscribeState } from "@real-router/core";

export type { SubscribeState } from "@real-router/core";

export function state$(
  router: Router,
  options?: { replay?: boolean },
): RxObservable<SubscribeState> {
  const { replay = true } = options ?? {};

  return new RxObservable<SubscribeState>((observer) => {
    const unsubscribe = router.addEventListener(
      events.TRANSITION_SUCCESS,
      (toState: State, fromState: State | undefined) => {
        observer.next?.({ route: toState, previousRoute: fromState });
      },
    );

    if (replay) {
      const currentState = router.getState();

      if (currentState) {
        queueMicrotask(() => {
          observer.next?.({ route: currentState, previousRoute: undefined });
        });
      }
    }

    return unsubscribe;
  });
}
