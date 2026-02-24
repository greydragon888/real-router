import { events, getPluginApi } from "@real-router/core";

import { RxObservable } from "./RxObservable";

import type {
  Router,
  State,
  NavigationOptions,
  RouterError,
} from "@real-router/core";

export type RouterEvent =
  | { type: "ROUTER_START" }
  | { type: "ROUTER_STOP" }
  | { type: "TRANSITION_START"; toState: State; fromState: State | undefined }
  | {
      type: "TRANSITION_SUCCESS";
      toState: State;
      fromState: State | undefined;
      options: NavigationOptions;
    }
  | {
      type: "TRANSITION_ERROR";
      toState: State | undefined;
      fromState: State | undefined;
      error: RouterError;
    }
  | { type: "TRANSITION_CANCEL"; toState: State; fromState: State | undefined };

export function events$(router: Router): RxObservable<RouterEvent> {
  return new RxObservable<RouterEvent>((observer) => {
    const api = getPluginApi(router);
    const unsubscribes: (() => void)[] = [];

    /* eslint-disable unicorn/prefer-single-call -- individual pushes for partial registration safety */
    try {
      unsubscribes.push(
        api.addEventListener(events.ROUTER_START, () => {
          observer.next?.({ type: "ROUTER_START" });
        }),
      );
      unsubscribes.push(
        api.addEventListener(events.ROUTER_STOP, () => {
          observer.next?.({ type: "ROUTER_STOP" });
        }),
      );
      unsubscribes.push(
        api.addEventListener(
          events.TRANSITION_START,
          (toState: State, fromState: State | undefined) => {
            observer.next?.({ type: "TRANSITION_START", toState, fromState });
          },
        ),
      );
      unsubscribes.push(
        api.addEventListener(
          events.TRANSITION_SUCCESS,
          (
            toState: State,
            fromState: State | undefined,
            options: NavigationOptions,
          ) => {
            observer.next?.({
              type: "TRANSITION_SUCCESS",
              toState,
              fromState,
              options,
            });
          },
        ),
      );
      unsubscribes.push(
        api.addEventListener(
          events.TRANSITION_ERROR,
          (
            toState: State | undefined,
            fromState: State | undefined,
            error: RouterError,
          ) => {
            observer.next?.({
              type: "TRANSITION_ERROR",
              toState,
              fromState,
              error,
            });
          },
        ),
      );
      unsubscribes.push(
        api.addEventListener(
          events.TRANSITION_CANCEL,
          (toState: State, fromState: State | undefined) => {
            observer.next?.({ type: "TRANSITION_CANCEL", toState, fromState });
          },
        ),
      );
      /* eslint-enable unicorn/prefer-single-call */
      /* v8 ignore start -- defensive: partial listener registration failure */
    } catch (error) {
      // Clean up any listeners that were successfully registered
      for (const unsub of unsubscribes) {
        unsub();
      }

      throw error;
    }
    /* v8 ignore stop */

    return () => {
      for (const unsub of unsubscribes) {
        unsub();
      }
    };
  });
}
