import { createRouter } from "@real-router/core";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { createStressRouter } from "./helpers";
import { events$, filter, state$ } from "../../src";

import type { RouterEvent, SubscribeState, Subscription } from "../../src";
import type { Router } from "@real-router/core";

describe("RX3: events$() listener fan-out", () => {
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

  it("3.1: 100 events$() subscriptions + 50 navigations each receive 100 events", async () => {
    await router.start("/route0");

    const received: RouterEvent[][] = Array.from({ length: 100 }, () => []);
    const subs: Subscription[] = Array.from({ length: 100 }, (_, i) =>
      events$(router).subscribe({ next: (event) => received[i].push(event) }),
    );

    for (let i = 0; i < 50; i++) {
      await router.navigate(routes[1 + (i % 9)]);
    }

    for (const sub of subs) {
      sub.unsubscribe();
    }

    for (const evs of received) {
      expect(evs).toHaveLength(100);
    }

    const first = received[0];

    expect(
      first.filter((event) => event.type === "TRANSITION_START"),
    ).toHaveLength(50);
    expect(
      first.filter((event) => event.type === "TRANSITION_SUCCESS"),
    ).toHaveLength(50);
  });

  it("3.2: 100 events$() unsubscribed before 50 navigations receive 0 events", async () => {
    await router.start("/route0");

    const received: RouterEvent[][] = Array.from({ length: 100 }, () => []);
    const subs = Array.from({ length: 100 }, (_, i) =>
      events$(router).subscribe({ next: (event) => received[i].push(event) }),
    );

    for (const sub of subs) {
      sub.unsubscribe();
    }

    for (let i = 0; i < 50; i++) {
      await router.navigate(routes[1 + (i % 9)]);
    }

    for (const evs of received) {
      expect(evs).toHaveLength(0);
    }
  });

  it("3.3: rapid subscribe/unsubscribe events$() × 200 produces no errors", async () => {
    const ownRouter = createRouter(
      [
        { name: "home", path: "/" },
        { name: "about", path: "/about" },
      ],
      { defaultRoute: "home" },
    );

    await ownRouter.start("/");

    let errorCount = 0;

    for (let i = 0; i < 200; i++) {
      const sub = events$(ownRouter).subscribe({
        next: () => {},
        error: () => {
          errorCount++;
        },
      });

      sub.unsubscribe();
    }

    const postEvents: RouterEvent[] = [];
    const postSub = events$(ownRouter).subscribe({
      next: (event) => postEvents.push(event),
    });

    await ownRouter.navigate("about");
    postSub.unsubscribe();

    expect(errorCount).toStrictEqual(0);
    expect(
      postEvents.filter((event) => event.type === "TRANSITION_SUCCESS"),
    ).toHaveLength(1);

    ownRouter.stop();
  });

  it("3.4: 50 events$() filtered to TRANSITION_SUCCESS + 100 navigations deliver only success events", async () => {
    await router.start("/route0");

    const received: RouterEvent[][] = Array.from({ length: 50 }, () => []);
    const subs = Array.from({ length: 50 }, (_, i) =>
      events$(router)
        .pipe(filter((event) => event.type === "TRANSITION_SUCCESS"))
        .subscribe({ next: (event) => received[i].push(event) }),
    );

    for (let i = 0; i < 100; i++) {
      await router.navigate(routes[1 + (i % 9)]);
    }

    for (const sub of subs) {
      sub.unsubscribe();
    }

    for (const evs of received) {
      expect(evs).toHaveLength(100);

      for (const event of evs) {
        expect(event.type).toStrictEqual("TRANSITION_SUCCESS");
      }
    }
  });

  it("3.5: 50 events$() and 50 state$() do not interfere across 100 navigations", async () => {
    await router.start("/route0");

    const eventsReceived: RouterEvent[][] = Array.from(
      { length: 50 },
      () => [],
    );
    const statesReceived: SubscribeState[][] = Array.from(
      { length: 50 },
      () => [],
    );
    const eventsSubs = Array.from({ length: 50 }, (_, i) =>
      events$(router).subscribe({
        next: (event) => eventsReceived[i].push(event),
      }),
    );
    const stateSubs = Array.from({ length: 50 }, (_, i) =>
      state$(router, { replay: false }).subscribe({
        next: (s) => statesReceived[i].push(s),
      }),
    );

    for (let i = 0; i < 100; i++) {
      await router.navigate(routes[1 + (i % 9)]);
    }

    for (const sub of eventsSubs) {
      sub.unsubscribe();
    }

    for (const sub of stateSubs) {
      sub.unsubscribe();
    }

    for (const evs of eventsReceived) {
      expect(evs).toHaveLength(200);
    }

    for (const states of statesReceived) {
      expect(states).toHaveLength(100);
    }
  });

  it("3.6: 50 events$() over 20 stop/start/navigate cycles with no leaked listeners", async () => {
    await router.start("/route0");

    const stopCounts: number[] = Array.from({ length: 50 }, () => 0);
    const startCounts: number[] = Array.from({ length: 50 }, () => 0);
    const successCounts: number[] = Array.from({ length: 50 }, () => 0);
    const subs = Array.from({ length: 50 }, (_, i) =>
      events$(router).subscribe({
        next: (event) => {
          switch (event.type) {
            case "ROUTER_STOP": {
              stopCounts[i]++;

              break;
            }
            case "ROUTER_START": {
              startCounts[i]++;

              break;
            }
            case "TRANSITION_SUCCESS": {
              successCounts[i]++;

              break;
            }
          }
        },
      }),
    );

    for (let cycle = 0; cycle < 20; cycle++) {
      router.stop();
      await router.start("/route0");

      for (let n = 0; n < 5; n++) {
        await router.navigate(routes[1 + (n % 9)]);
      }
    }

    for (let i = 0; i < 50; i++) {
      expect(stopCounts[i]).toStrictEqual(20);
      expect(startCounts[i]).toStrictEqual(20);
      expect(successCounts[i]).toStrictEqual(120);
    }

    for (const sub of subs) {
      sub.unsubscribe();
    }

    await router.navigate(routes[1]);
    await router.navigate(routes[2]);

    for (let i = 0; i < 50; i++) {
      expect(stopCounts[i]).toStrictEqual(20);
      expect(startCounts[i]).toStrictEqual(20);
      expect(successCounts[i]).toStrictEqual(120);
    }
  });
});
