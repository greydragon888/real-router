import { BaseSource } from "./BaseSource";
import { computeSnapshot } from "./computeSnapshot.js";
import { getCachedShouldUpdate } from "./shouldUpdateCache.js";

import type { RouteNodeSnapshot, RouterSource } from "./types.js";
import type { Router } from "@real-router/types";

class RouteNodeSource implements RouterSource<RouteNodeSnapshot> {
  readonly #source: BaseSource<RouteNodeSnapshot>;
  readonly #unsubscribe: () => void;

  constructor(router: Router, nodeName: string) {
    const initialSnapshot: RouteNodeSnapshot = {
      route: undefined,
      previousRoute: undefined,
    };
    const computedInitial = computeSnapshot(initialSnapshot, router, nodeName);

    this.#source = new BaseSource(computedInitial);
    const shouldUpdate = getCachedShouldUpdate(router, nodeName);

    this.#unsubscribe = router.subscribe((next) => {
      if (!shouldUpdate(next.route, next.previousRoute)) {
        return;
      }

      const newSnapshot = computeSnapshot(
        this.#source.getSnapshot(),
        router,
        nodeName,
        next,
      );

      /* v8 ignore next 3 -- @preserve: dedup guard; shouldUpdateNode filters accurately so computeSnapshot always returns new ref */
      if (!Object.is(this.#source.getSnapshot(), newSnapshot)) {
        this.#source.updateSnapshot(newSnapshot);
      }
    });

    this.subscribe = this.subscribe.bind(this);
    this.getSnapshot = this.getSnapshot.bind(this);
    this.destroy = this.destroy.bind(this);
  }

  subscribe(listener: () => void): () => void {
    return this.#source.subscribe(listener);
  }

  getSnapshot(): RouteNodeSnapshot {
    return this.#source.getSnapshot();
  }

  destroy(): void {
    this.#unsubscribe();
    this.#source.destroy();
  }
}

export function createRouteNodeSource(
  router: Router,
  nodeName: string,
): RouterSource<RouteNodeSnapshot> {
  return new RouteNodeSource(router, nodeName);
}
