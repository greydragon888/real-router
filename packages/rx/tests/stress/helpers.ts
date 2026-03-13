import { createRouter } from "@real-router/core";

import { RxObservable } from "../../src/RxObservable";

import type { Observer } from "../../src/types";
import type { Router } from "@real-router/core";

export function createControllableSource<T>(): {
  observable: RxObservable<T>;
  emit: (value: T) => void;
  complete: () => void;
  error: (err: unknown) => void;
} {
  const observers: Observer<T>[] = [];

  const observable = new RxObservable<T>((observer) => {
    observers.push(observer);

    return () => {
      const idx = observers.indexOf(observer);

      if (idx !== -1) {
        observers.splice(idx, 1);
      }
    };
  });

  return {
    observable,
    emit: (value: T) => {
      for (const obs of observers) {
        obs.next?.(value);
      }
    },
    complete: () => {
      for (const obs of observers) {
        obs.complete?.();
      }
    },
    error: (err: unknown) => {
      for (const obs of observers) {
        obs.error?.(err);
      }
    },
  };
}

export function createStressRouter(routeCount = 10): {
  router: Router;
  routes: string[];
} {
  const routes = Array.from({ length: routeCount }, (_, i) => ({
    name: `route${i}`,
    path: `/route${i}`,
  }));

  const router = createRouter(routes, { defaultRoute: "route0" });

  return { router, routes: routes.map((r) => r.name) };
}

export function emitBurst<T>(emit: (value: T) => void, values: T[]): void {
  for (const value of values) {
    emit(value);
  }
}

export async function emitAsync<T>(
  emit: (value: T) => void,
  values: T[],
  delayMs: number,
): Promise<void> {
  for (const value of values) {
    emit(value);
    await new Promise((resolve) => {
      setTimeout(resolve, delayMs);
    });
  }
}
