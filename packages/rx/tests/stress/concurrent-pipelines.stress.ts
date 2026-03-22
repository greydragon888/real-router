import { createRouter } from "@real-router/core";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { createStressRouter } from "./helpers";
import { distinctUntilChanged, filter, map, state$ } from "../../src";

import type { SubscribeState, Subscription } from "../../src";
import type { Router } from "@real-router/core";

describe("RX7: Concurrent state$() pipelines", () => {
  let router: Router;
  let routes: string[];

  beforeEach(() => {
    const result = createStressRouter(10);

    router = result.router;
    routes = result.routes;
  });

  afterEach(() => {
    if (router.isActive()) {
      router.stop();
    }
  });

  it("7.2: 50 state$({ replay: false }) subscriptions + 200 navigations each get 200 values", async () => {
    await router.start("/route0");

    const received: SubscribeState[][] = Array.from({ length: 50 }, () => []);
    const subs = Array.from({ length: 50 }, (_, i) =>
      state$(router, { replay: false }).subscribe({
        next: (s) => received[i].push(s),
      }),
    );

    for (let i = 0; i < 200; i++) {
      await router.navigate(routes[1 + (i % 9)]);
    }

    for (const sub of subs) {
      sub.unsubscribe();
    }

    for (const states of received) {
      expect(states).toHaveLength(200);
    }
  });

  it("7.3: 25 map+filter pipelines and 25 distinctUntilChanged pipelines run concurrently", async () => {
    await router.start("/route0");

    const groupA: string[][] = Array.from({ length: 25 }, () => []);
    const groupB: SubscribeState[][] = Array.from({ length: 25 }, () => []);
    const subsA = Array.from({ length: 25 }, (_, i) =>
      state$(router, { replay: false })
        .pipe(
          map(({ route }) => route.name),
          filter((name) => name !== "route0"),
        )
        .subscribe({ next: (name) => groupA[i].push(name) }),
    );
    const subsB = Array.from({ length: 25 }, (_, i) =>
      state$(router, { replay: false })
        .pipe(distinctUntilChanged((a, b) => a.route.name === b.route.name))
        .subscribe({ next: (s) => groupB[i].push(s) }),
    );

    for (let i = 0; i < 100; i++) {
      await router.navigate(routes[(1 + i) % 10]);
    }

    for (const sub of subsA) {
      sub.unsubscribe();
    }

    for (const sub of subsB) {
      sub.unsubscribe();
    }

    for (const names of groupA) {
      expect(names).toHaveLength(90);

      for (const name of names) {
        expect(name).not.toStrictEqual("route0");
      }
    }

    for (const states of groupB) {
      expect(states).toHaveLength(100);

      for (let i = 1; i < states.length; i++) {
        expect(states[i].route.name).not.toStrictEqual(
          states[i - 1].route.name,
        );
      }
    }
  });

  it("7.4: 50 state$() subscriptions receive first 100 navigations but not second 100", async () => {
    await router.start("/route0");

    const received: SubscribeState[][] = Array.from({ length: 50 }, () => []);
    const subs = Array.from({ length: 50 }, (_, i) =>
      state$(router, { replay: false }).subscribe({
        next: (s) => received[i].push(s),
      }),
    );

    for (let i = 0; i < 100; i++) {
      await router.navigate(routes[1 + (i % 9)]);
    }

    for (const sub of subs) {
      sub.unsubscribe();
    }

    await router.navigate(routes[0]);

    for (let i = 0; i < 100; i++) {
      await router.navigate(routes[1 + (i % 9)]);
    }

    for (const states of received) {
      expect(states).toHaveLength(100);
    }
  });

  it("7.5: 50 state$() subscriptions with AbortSignal stop receiving after abort", async () => {
    const ownRouter = createRouter(
      Array.from({ length: 10 }, (_, k) => ({
        name: `route${k}`,
        path: `/route${k}`,
      })),
      { defaultRoute: "route0" },
    );

    await ownRouter.start("/route0");

    const received: SubscribeState[][] = Array.from({ length: 50 }, () => []);
    const controllers = Array.from({ length: 50 }, () => new AbortController());
    const subs: Subscription[] = Array.from({ length: 50 }, (_, i) =>
      state$(ownRouter, { replay: false }).subscribe(
        { next: (s) => received[i].push(s) },
        { signal: controllers[i].signal },
      ),
    );

    for (let i = 0; i < 50; i++) {
      await ownRouter.navigate(`route${1 + (i % 9)}`);
    }

    for (const ctrl of controllers) {
      ctrl.abort();
    }

    for (let i = 0; i < 50; i++) {
      await ownRouter.navigate(`route${1 + (i % 9)}`);
    }

    for (const sub of subs) {
      sub.unsubscribe();
    }

    for (const states of received) {
      expect(states).toHaveLength(50);
    }

    ownRouter.stop();
  });
});
