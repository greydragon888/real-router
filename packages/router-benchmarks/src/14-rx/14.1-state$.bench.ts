// packages/router-benchmarks/src/14-rx/14.1-state$.bench.ts

import {
  debounceTime,
  distinctUntilChanged,
  filter,
  map,
  state$,
  takeUntil,
} from "@real-router/rx";
import { bench } from "mitata";

import { createSimpleRouter } from "../helpers";

// Import rx package

/**
 * Batch size for stable measurements.
 */
const BATCH = 50;

// 14.1.1 state$ subscribe throughput
{
  const router = createSimpleRouter();

  router.start();

  bench(`14.1.1 state$ subscribe throughput (1000 navigations)`, async () => {
    const subscription = state$(router).subscribe(() => {
      // State handler
    });

    for (let i = 0; i < 1000; i++) {
      router.navigate(i % 2 === 0 ? "home" : "about");
    }

    subscription.unsubscribe();
  }).gc("inner");
}

// 14.1.2 pipe with 1 operator (map)
{
  const router = createSimpleRouter();

  router.start();

  bench(`14.1.2 pipe with 1 operator (map) (×${BATCH})`, async () => {
    for (let b = 0; b < BATCH; b++) {
      const subscription = state$(router)
        .pipe(map(({ route }) => route.name))
        .subscribe(() => {
          // Handler
        });

      router.navigate("home");
      router.navigate("about");

      subscription.unsubscribe();
    }
  }).gc("inner");
}

// 14.1.3 pipe with 3 operators (map + filter + distinctUntilChanged)
{
  const router = createSimpleRouter();

  router.start();

  bench(
    `14.1.3 pipe with 3 operators (map + filter + distinctUntilChanged) (×${BATCH})`,
    async () => {
      for (let b = 0; b < BATCH; b++) {
        const subscription = state$(router)
          .pipe(
            map(({ route }) => route.name),
            filter((name: string) => name !== "home"),
            distinctUntilChanged(),
          )
          .subscribe(() => {
            // Handler
          });

        router.navigate("home");
        router.navigate("about");
        router.navigate("about"); // Duplicate, should be filtered

        subscription.unsubscribe();
      }
    },
  ).gc("inner");
}

// 14.1.4 pipe with 5 operators (all operators)
{
  const router = createSimpleRouter();

  router.start();

  bench(
    `14.1.4 pipe with 5 operators (map + filter + distinctUntilChanged + debounceTime + takeUntil) (×${BATCH})`,
    async () => {
      for (let b = 0; b < BATCH; b++) {
        // Create a notifier that never emits (takeUntil won't trigger)
        const notifier$ = state$(router).pipe(
          filter(() => false), // Never emits
        );

        const subscription = state$(router)
          .pipe(
            map(({ route }) => route.name),
            filter((name: string) => name !== "home"),
            distinctUntilChanged(),
            debounceTime(10),
            takeUntil(notifier$),
          )
          .subscribe(() => {
            // Handler
          });

        router.navigate("home");
        router.navigate("about");

        // Wait for debounce
        await new Promise((resolve) => setTimeout(resolve, 20));

        subscription.unsubscribe();
      }
    },
  ).gc("inner");
}

// 14.1.5 Multiple subscriptions
{
  const router = createSimpleRouter();

  router.start();

  bench(
    `14.1.5 Multiple subscriptions (10 subscribers) (×${BATCH})`,
    async () => {
      for (let b = 0; b < BATCH; b++) {
        const subscriptions: { unsubscribe: () => void }[] = [];

        for (let i = 0; i < 10; i++) {
          subscriptions.push(
            state$(router).subscribe(() => {
              // Handler
            }),
          );
        }

        router.navigate("home");
        router.navigate("about");

        for (const sub of subscriptions) {
          sub.unsubscribe();
        }
      }
    },
  ).gc("inner");
}
