import { createRouter } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { events$, filter } from "../../src";

import type { RouterEvent } from "../../src";
import type { Router } from "@real-router/core";

describe("events$()", () => {
  let router: Router;

  const routes = [
    { name: "home", path: "/" },
    { name: "protected", path: "/protected" },
    { name: "about", path: "/about" },
  ];

  beforeEach(() => {
    router = createRouter(routes, { defaultRoute: "home" });
  });

  afterEach(() => {
    if (router.isActive()) {
      router.stop();
    }
  });

  it("should emit ROUTER_START event", async () => {
    const events: RouterEvent[] = [];

    events$(router).subscribe({
      next: (event) => events.push(event),
    });

    await router.start("/");

    const startEvent = events.find((event) => event.type === "ROUTER_START");

    expect(startEvent).toBeDefined();
    expect(startEvent?.type).toBe("ROUTER_START");
  });

  it("should emit TRANSITION_START event on navigation", async () => {
    const events: RouterEvent[] = [];

    await router.start("/");

    events$(router).subscribe({
      next: (event) => events.push(event),
    });

    await router.navigate("about");

    const startEvent = events.find(
      (event) => event.type === "TRANSITION_START",
    );

    expect(startEvent).toBeDefined();
    expect(startEvent?.type).toBe("TRANSITION_START");
    expect(
      startEvent?.type === "TRANSITION_START" ? startEvent.toState.name : null,
    ).toBe("about");
    expect(
      startEvent?.type === "TRANSITION_START"
        ? startEvent.fromState?.name
        : null,
    ).toBe("home");
  });

  it("should emit TRANSITION_LEAVE_APPROVE event on navigation", async () => {
    const events: RouterEvent[] = [];

    await router.start("/");

    // Add a deactivation guard to trigger TRANSITION_LEAVE_APPROVE
    const lifecycle = getLifecycleApi(router);

    lifecycle.addDeactivateGuard("protected", () => () => true);

    events$(router).subscribe({
      next: (event) => events.push(event),
    });

    await router.navigate("protected");
    await router.navigate("about");

    const leaveApproveEvent = events.find(
      (event) => event.type === "TRANSITION_LEAVE_APPROVE",
    );

    expect(leaveApproveEvent).toBeDefined();
    expect(leaveApproveEvent?.type).toBe("TRANSITION_LEAVE_APPROVE");
  });

  it("should emit TRANSITION_LEAVE_APPROVE with correct toState and fromState", async () => {
    const events: RouterEvent[] = [];

    await router.start("/");
    await router.navigate("protected");

    // Add a deactivation guard to trigger TRANSITION_LEAVE_APPROVE
    const lifecycle = getLifecycleApi(router);

    lifecycle.addDeactivateGuard("protected", () => () => true);

    events$(router).subscribe({
      next: (event) => events.push(event),
    });

    await router.navigate("about");

    const leaveApproveEvent = events.find(
      (event) => event.type === "TRANSITION_LEAVE_APPROVE",
    );

    expect(leaveApproveEvent).toBeDefined();
    expect(leaveApproveEvent?.type).toBe("TRANSITION_LEAVE_APPROVE");
    expect(
      leaveApproveEvent?.type === "TRANSITION_LEAVE_APPROVE"
        ? leaveApproveEvent.toState.name
        : null,
    ).toBe("about");
    expect(
      leaveApproveEvent?.type === "TRANSITION_LEAVE_APPROVE" &&
        leaveApproveEvent.fromState
        ? leaveApproveEvent.fromState.name
        : null,
    ).toBe("protected");
  });

  it("should emit TRANSITION_SUCCESS event on successful navigation", async () => {
    const events: RouterEvent[] = [];

    await router.start("/");

    events$(router).subscribe({
      next: (event) => events.push(event),
    });

    await router.navigate("about");

    const successEvent = events.find(
      (event) => event.type === "TRANSITION_SUCCESS",
    );

    expect(successEvent).toBeDefined();
    expect(successEvent?.type).toBe("TRANSITION_SUCCESS");
    expect(
      successEvent?.type === "TRANSITION_SUCCESS"
        ? successEvent.toState.name
        : null,
    ).toBe("about");
    expect(
      successEvent?.type === "TRANSITION_SUCCESS"
        ? successEvent.fromState?.name
        : null,
    ).toBe("home");
  });

  it("should filter events by type using pipe", async () => {
    const events: RouterEvent[] = [];

    await router.start("/");

    // Add a deactivation guard to trigger TRANSITION_LEAVE_APPROVE
    const lifecycle = getLifecycleApi(router);

    lifecycle.addDeactivateGuard("protected", () => () => true);

    await router.navigate("protected");

    events$(router)
      .pipe(filter((event) => event.type === "TRANSITION_LEAVE_APPROVE"))
      .subscribe({
        next: (event) => events.push(event),
      });

    await router.navigate("about");

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("TRANSITION_LEAVE_APPROVE");
  });

  it("should emit TRANSITION_ERROR event when navigation fails", async () => {
    const events: RouterEvent[] = [];

    await router.start("/");

    events$(router).subscribe({
      next: (event) => events.push(event),
    });

    try {
      await router.navigate("nonexistent.route");
    } catch {
      // Expected: ROUTE_NOT_FOUND error
    }

    const errorEvent = events.find(
      (event) => event.type === "TRANSITION_ERROR",
    );

    expect(errorEvent).toBeDefined();
    expect(errorEvent?.type).toBe("TRANSITION_ERROR");
    expect(
      errorEvent?.type === "TRANSITION_ERROR" ? errorEvent.error.code : null,
    ).toBe("ROUTE_NOT_FOUND");
  });

  it("should emit TRANSITION_ERROR with correct fromState", async () => {
    const events: RouterEvent[] = [];

    await router.start("/");

    events$(router).subscribe({
      next: (event) => events.push(event),
    });

    try {
      await router.navigate("nonexistent.route");
    } catch {
      // Expected: ROUTE_NOT_FOUND error
    }

    const errorEvent = events.find(
      (event) => event.type === "TRANSITION_ERROR",
    );

    expect(errorEvent).toBeDefined();
    expect(
      errorEvent?.type === "TRANSITION_ERROR" && errorEvent.fromState
        ? errorEvent.fromState.name
        : null,
    ).toBe("home");
  });

  it("should emit ROUTER_STOP event on router stop", async () => {
    const events: RouterEvent[] = [];

    await router.start("/");

    events$(router).subscribe({
      next: (event) => events.push(event),
    });

    router.stop();

    const stopEvent = events.find((event) => event.type === "ROUTER_STOP");

    expect(stopEvent).toBeDefined();
    expect(stopEvent?.type).toBe("ROUTER_STOP");
  });
});
