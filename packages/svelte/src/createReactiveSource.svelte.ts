import { createSubscriber } from "svelte/reactivity";

import type { RouterSource } from "@real-router/sources";

export function createReactiveSource<T>(source: RouterSource<T>): {
  readonly current: T;
} {
  const subscribe = createSubscriber((update) => {
    return source.subscribe(() => {
      update();
    });
  });

  return {
    get current(): T {
      subscribe();

      return source.getSnapshot();
    },
  };
}
