import { areRoutesRelated } from "@real-router/route-utils";

import { BaseSource } from "./BaseSource";

import type { ActiveRouteSourceOptions, RouterSource } from "./types.js";
import type { Params, Router } from "@real-router/core";

class ActiveRouteSource implements RouterSource<boolean> {
  readonly #source: BaseSource<boolean>;
  readonly #unsubscribe: () => void;

  constructor(
    router: Router,
    routeName: string,
    params?: Params,
    options?: ActiveRouteSourceOptions,
  ) {
    const strict = options?.strict ?? false;
    const ignoreQueryParams = options?.ignoreQueryParams ?? true;

    const initialValue = router.isActiveRoute(
      routeName,
      params,
      strict,
      ignoreQueryParams,
    );

    this.#source = new BaseSource(initialValue);

    this.#unsubscribe = router.subscribe((next) => {
      const isNewRelated = areRoutesRelated(routeName, next.route.name);
      const isPrevRelated =
        next.previousRoute &&
        areRoutesRelated(routeName, next.previousRoute.name);

      if (!isNewRelated && !isPrevRelated) {
        return;
      }

      // If new route is not related, we know the route is inactive —
      // avoid calling isActiveRoute for the optimization
      const newValue = isNewRelated
        ? router.isActiveRoute(routeName, params, strict, ignoreQueryParams)
        : false;

      if (!Object.is(this.#source.getSnapshot(), newValue)) {
        this.#source.updateSnapshot(newValue);
      }
    });

    this.subscribe = this.subscribe.bind(this);
    this.getSnapshot = this.getSnapshot.bind(this);
    this.destroy = this.destroy.bind(this);
  }

  subscribe(listener: () => void): () => void {
    return this.#source.subscribe(listener);
  }

  getSnapshot(): boolean {
    return this.#source.getSnapshot();
  }

  destroy(): void {
    this.#unsubscribe();
    this.#source.destroy();
  }
}

export function createActiveRouteSource(
  router: Router,
  routeName: string,
  params?: Params,
  options?: ActiveRouteSourceOptions,
): RouterSource<boolean> {
  return new ActiveRouteSource(router, routeName, params, options);
}
