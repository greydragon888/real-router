import { getPluginApi, events } from "@real-router/core";

import { BaseSource } from "./BaseSource";

import type { RouterTransitionSnapshot, RouterSource } from "./types.js";
import type { Router, State } from "@real-router/core";

const IDLE_SNAPSHOT: RouterTransitionSnapshot = {
  isTransitioning: false,
  toRoute: null,
  fromRoute: null,
};

class TransitionSource implements RouterSource<RouterTransitionSnapshot> {
  readonly #source: BaseSource<RouterTransitionSnapshot>;
  readonly #unsubs: (() => void)[];

  constructor(router: Router) {
    this.#source = new BaseSource(IDLE_SNAPSHOT);

    const api = getPluginApi(router);

    const resetToIdle = (): void => {
      this.#source.updateSnapshot(IDLE_SNAPSHOT);
    };

    this.#unsubs = [
      api.addEventListener(
        events.TRANSITION_START,
        (toState: State, fromState?: State) => {
          this.#source.updateSnapshot({
            isTransitioning: true,
            toRoute: toState,
            fromRoute: fromState ?? null,
          });
        },
      ),
      api.addEventListener(events.TRANSITION_SUCCESS, resetToIdle),
      api.addEventListener(events.TRANSITION_ERROR, resetToIdle),
      api.addEventListener(events.TRANSITION_CANCEL, resetToIdle),
    ];

    this.subscribe = this.subscribe.bind(this);
    this.getSnapshot = this.getSnapshot.bind(this);
    this.destroy = this.destroy.bind(this);
  }

  subscribe(listener: () => void): () => void {
    return this.#source.subscribe(listener);
  }

  getSnapshot(): RouterTransitionSnapshot {
    return this.#source.getSnapshot();
  }

  destroy(): void {
    this.#unsubs.forEach((u) => {
      u();
    });
    this.#source.destroy();
  }
}

export function createTransitionSource(
  router: Router,
): RouterSource<RouterTransitionSnapshot> {
  return new TransitionSource(router);
}
