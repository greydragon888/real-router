import { describe, it, expect, expectTypeOf, vi } from "vitest";

import { createRouter } from "@real-router/core";
import { cloneRouter, getRoutesApi } from "@real-router/core/api";

import type {
  ParamsSearch,
  Route,
  RouteConfigUpdate,
  Router,
  TreeChangedEvent,
} from "@real-router/core";

/**
 * Carrying functional tests for the `TREE_CHANGED` event surface
 * (`getRoutesApi(router).subscribeChanges`). See §3.5 of
 * `.claude/rfc-tree-mutation-event.md`.
 */

function makeRouter(routes: Route[] = []): Router {
  return createRouter(routes, { defaultRoute: "home" });
}

/** Assert the event's discriminant and narrow it — keeps test bodies branch-free. */
function asOp<O extends TreeChangedEvent["op"]>(
  event: TreeChangedEvent | undefined,
  op: O,
): Extract<TreeChangedEvent, { op: O }> {
  expect(event?.op).toBe(op);

  return event as Extract<TreeChangedEvent, { op: O }>;
}

const byName = (a: string, b: string): number => a.localeCompare(b);

const BASE_ROUTES: Route[] = [
  { name: "home", path: "/home" },
  {
    name: "users",
    path: "/users",
    children: [{ name: "view", path: "/view/:id" }],
  },
];

describe("core/events/tree-changed", () => {
  // 1. One emit per CRUD operation for each of the 5 methods.
  it("emits exactly one event per CRUD operation, with the correct op", () => {
    const router = makeRouter([...BASE_ROUTES]);
    const routesApi = getRoutesApi(router);

    const events: TreeChangedEvent[] = [];

    routesApi.subscribeChanges((event) => events.push(event));

    routesApi.add({ name: "about", path: "/about" });
    routesApi.update("home", { forwardTo: "about" });
    routesApi.remove("users");
    routesApi.replace([{ name: "x", path: "/x" }]);
    routesApi.clear();

    expect(events.map((event) => event.op)).toStrictEqual([
      "add",
      "update",
      "remove",
      "replace",
      "clear",
    ]);
  });

  // 2. Payload shape + update.patch is a frozen envelope (caller untouched).
  it("matches the discriminated union and freezes the update.patch envelope", () => {
    const router = makeRouter([...BASE_ROUTES]);
    const routesApi = getRoutesApi(router);

    let captured: TreeChangedEvent | undefined;

    routesApi.subscribeChanges((event) => {
      captured = event;
    });

    const patch: { defaultParams: { foo: string }; forwardTo?: string } = {
      defaultParams: { foo: "1" },
    };

    routesApi.update("users", patch);

    const updateEvent = asOp(captured, "update");

    // expectTypeOf narrows to the update variant after the discriminant check.
    expectTypeOf(updateEvent.op).toEqualTypeOf<"update">();

    // The payload is a distinct, frozen envelope: a later mutation of the
    // caller's patch object is not reflected, and the envelope cannot be edited.
    patch.forwardTo = "home";

    expect("forwardTo" in updateEvent.patch).toBe(false);
    expect(Object.isFrozen(updateEvent.patch)).toBe(true);
    expect(() => {
      (updateEvent.patch as Record<string, unknown>).forwardTo = "home";
    }).toThrow(TypeError);

    // Nested structural values are carried by reference (the stored object).
    expect(updateEvent.patch.defaultParams).toStrictEqual({ foo: "1" });
  });

  // 3. Timing — handler observes the post-mutation tree.
  it("delivers the event after the commit (handler sees post-state)", () => {
    const router = makeRouter([...BASE_ROUTES]);
    const routesApi = getRoutesApi(router);

    let hadRouteDuringHandler = false;
    let pathDuringHandler: string | undefined;

    routesApi.subscribeChanges((event) => {
      if (event.op === "add") {
        hadRouteDuringHandler = routesApi.has("about");
        pathDuringHandler = routesApi.get("about")?.path;
      }
    });

    routesApi.add({ name: "about", path: "/about" });

    expect(hadRouteDuringHandler).toBe(true);
    expect(pathDuringHandler).toBe("/about");
  });

  // 5. Cloned router isolation.
  it("does not cross the clone boundary in either direction", () => {
    const parent = makeRouter([...BASE_ROUTES]);
    const clone = cloneRouter(parent);

    const parentApi = getRoutesApi(parent);
    const cloneApi = getRoutesApi(clone);

    const parentEvents: TreeChangedEvent[] = [];
    const cloneEvents: TreeChangedEvent[] = [];

    parentApi.subscribeChanges((event) => parentEvents.push(event));
    cloneApi.subscribeChanges((event) => cloneEvents.push(event));

    cloneApi.add({ name: "clone-only", path: "/clone-only" });
    parentApi.add({ name: "parent-only", path: "/parent-only" });

    expect(parentEvents).toHaveLength(1);
    expect(cloneEvents).toHaveLength(1);
    expect(parentEvents[0]).toMatchObject({ op: "add" });
    expect(cloneEvents[0]).toMatchObject({ op: "add" });
  });

  // 6. Atomicity — one call = one event regardless of route count.
  it("emits a single event for a multi-route add", () => {
    const router = makeRouter([{ name: "home", path: "/home" }]);
    const routesApi = getRoutesApi(router);

    const events: TreeChangedEvent[] = [];

    routesApi.subscribeChanges((event) => events.push(event));

    routesApi.add([
      { name: "a", path: "/a" },
      { name: "b", path: "/b" },
      { name: "c", path: "/c" },
    ]);

    expect(events).toHaveLength(1);

    const event = asOp(events[0], "add");

    expect(event.added.map((route) => route.name)).toStrictEqual([
      "a",
      "b",
      "c",
    ]);
  });

  // 7. Eager-conditional diff for replace.
  it("computes a flat replace diff (incl. descendants) only when subscribed", () => {
    // No subscriber: replace still works, nothing is observed.
    const noSub = makeRouter([...BASE_ROUTES]);
    const noSubApi = getRoutesApi(noSub);

    expect(() => {
      noSubApi.replace([{ name: "home", path: "/home" }]);
    }).not.toThrow();

    // With a subscriber: removed/added are flat and ready (no lazy calls).
    const router = makeRouter([...BASE_ROUTES]);
    const routesApi = getRoutesApi(router);

    let captured: TreeChangedEvent | undefined;

    routesApi.subscribeChanges((event) => {
      captured = event;
    });

    routesApi.replace([
      { name: "home", path: "/home" },
      { name: "dash", path: "/dash" },
    ]);

    const event = asOp(captured, "replace");

    // "users" + "users.view" removed (flat by full name); "home" unchanged.
    expect(
      event.removed.map((route) => route.name).toSorted(byName),
    ).toStrictEqual(["users", "users.view"]);
    expect(event.added.map((route) => route.name)).toStrictEqual(["dash"]);
  });

  // 8. Multiple independent subscribers via subscribeChanges (FIFO).
  it("delivers identical payloads to all subscribers in registration order", () => {
    const router = makeRouter([{ name: "home", path: "/home" }]);
    const routesApi = getRoutesApi(router);

    const order: number[] = [];
    const payloads: TreeChangedEvent[] = [];

    routesApi.subscribeChanges((event) => {
      order.push(1);
      payloads.push(event);
    });
    routesApi.subscribeChanges((event) => {
      order.push(2);
      payloads.push(event);
    });
    routesApi.subscribeChanges((event) => {
      order.push(3);
      payloads.push(event);
    });

    routesApi.add({ name: "about", path: "/about" });

    expect(order).toStrictEqual([1, 2, 3]);
    // All three received the very same payload object.
    expect(payloads[0]).toBe(payloads[1]);
    expect(payloads[1]).toBe(payloads[2]);
  });

  it("stops delivering after unsubscribe", () => {
    const router = makeRouter([{ name: "home", path: "/home" }]);
    const routesApi = getRoutesApi(router);

    const handler = vi.fn();
    const unsubscribe = routesApi.subscribeChanges(handler);

    routesApi.add({ name: "a", path: "/a" });
    unsubscribe();
    routesApi.add({ name: "b", path: "/b" });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  // 9. Listener error isolation — one throwing handler doesn't break others
  //    and does not re-throw to the caller.
  it("isolates listener errors and never re-throws to the CRUD caller", () => {
    const router = makeRouter([{ name: "home", path: "/home" }]);
    const routesApi = getRoutesApi(router);

    const second = vi.fn();

    routesApi.subscribeChanges(() => {
      throw new Error("boom");
    });
    routesApi.subscribeChanges(second);

    expect(() => {
      routesApi.add({ name: "about", path: "/about" });
    }).not.toThrow();
    expect(second).toHaveBeenCalledTimes(1);
  });

  // 10. FIFO with re-entrant subscribe — B registered during E1 fires from E2.
  it("does not invoke a listener registered re-entrantly during the same emit", () => {
    const router = makeRouter([{ name: "home", path: "/home" }]);
    const routesApi = getRoutesApi(router);

    const b = vi.fn();
    let registeredB = false;

    routesApi.subscribeChanges(() => {
      if (!registeredB) {
        registeredB = true;
        routesApi.subscribeChanges(b);
      }
    });

    // First emit (E1): registers B mid-flight; B must NOT fire for E1.
    routesApi.add({ name: "e1", path: "/e1" });

    expect(b).toHaveBeenCalledTimes(0);

    // Second emit (E2): B is now part of the snapshot.
    routesApi.add({ name: "e2", path: "/e2" });

    expect(b).toHaveBeenCalledTimes(1);
  });

  // Guard-only / custom-field-only / empty updates are silent (О-7 +
  // empty-patch rule). Custom fields (lifecycle hooks, preload, searchSchema)
  // are read lazily by their consumers, so a custom-only patch needs no
  // observation channel — same rationale as guards.
  it("does not emit for guard-only, custom-field-only, or empty update patches", () => {
    const router = makeRouter([
      { name: "home", path: "/home" },
      { name: "other", path: "/other" },
    ]);
    const routesApi = getRoutesApi(router);

    // Custom field is not on the closed RouteConfigUpdate; a plugin augments it.
    type CustomPatch = RouteConfigUpdate & { onView?: (() => void) | null };

    const handler = vi.fn();

    routesApi.subscribeChanges(handler);

    const setCustom: CustomPatch = { onView: () => {} };
    const removeCustom: CustomPatch = { onView: null };
    const mixed: CustomPatch = {
      forwardTo: "other",
      canActivate: () => () => true,
      onView: () => {},
    };

    routesApi.update("home", { canActivate: () => () => false });
    routesApi.update("home", { canActivate: null });
    routesApi.update("home", {});
    routesApi.update("home", setCustom);
    routesApi.update("home", removeCustom);

    expect(handler).not.toHaveBeenCalled();

    // A structural field alongside a guard AND a custom field still emits — with
    // both the guard and the custom field filtered out of the structural patch.
    routesApi.update("home", mixed);

    expect(handler).toHaveBeenCalledTimes(1);

    const event = asOp(handler.mock.calls[0][0] as TreeChangedEvent, "update");

    expect(event.patch).toStrictEqual({ forwardTo: "other" });
    expect("canActivate" in event.patch).toBe(false);
    expect("onView" in event.patch).toBe(false);
  });

  // Payloads carry route config; add-with-parent sets `parent`; update emits on
  // encode/decode structural fields.
  it("carries config on payload routes, parent on add, encode/decode on update", () => {
    const fwd = (): string => "home";
    const enc = ({ params, search }: ParamsSearch): ParamsSearch => ({
      params,
      search,
    });
    const dec = ({ params, search }: ParamsSearch): ParamsSearch => ({
      params,
      search,
    });
    const guard = () => () => true;

    const router = makeRouter([
      { name: "home", path: "/home" },
      { name: "users", path: "/users" },
      {
        name: "fwd",
        path: "/fwd/:id",
        forwardTo: fwd,
        defaultParams: { a: 1 },
        encodeParams: enc,
        decodeParams: dec,
      },
      {
        name: "guarded",
        path: "/guarded",
        canActivate: guard,
        canDeactivate: guard,
      },
    ]);
    const routesApi = getRoutesApi(router);

    const events: TreeChangedEvent[] = [];

    routesApi.subscribeChanges((event) => events.push(event));

    // add with parent + nested children → `parent` on payload, FLAT added list
    // with full dotted names (descendants included).
    routesApi.add(
      {
        name: "child",
        path: "/child",
        children: [{ name: "grand", path: "/grand" }],
      },
      { parent: "users" },
    );

    const addEvent = asOp(events.at(-1), "add");

    expect(addEvent.parent).toBe("users");
    expect(addEvent.added.map((route) => route.name)).toStrictEqual([
      "users.child",
      "users.child.grand",
    ]);

    // update with encode/decode → structural emit, originals carried by ref.
    routesApi.update("home", { encodeParams: enc, decodeParams: dec });

    const updateEvent = asOp(events.at(-1), "update");

    expect(updateEvent.patch.encodeParams).toBe(enc);
    expect(updateEvent.patch.decodeParams).toBe(dec);

    // clear → payload routes carry every config field.
    routesApi.clear();

    const clearEvent = asOp(events.at(-1), "clear");
    const fwdRoute = clearEvent.removed.find((route) => route.name === "fwd");

    expect(fwdRoute?.forwardTo).toBe(fwd);
    expect(fwdRoute?.defaultParams).toStrictEqual({ a: 1 });
    expect(typeof fwdRoute?.encodeParams).toBe("function");
    expect(typeof fwdRoute?.decodeParams).toBe("function");

    const guardedRoute = clearEvent.removed.find(
      (route) => route.name === "guarded",
    );

    expect(guardedRoute?.canActivate).toBe(guard);
    expect(guardedRoute?.canDeactivate).toBe(guard);
  });

  // remove payload carries the full subtree (flat, full dotted names).
  it("includes the full removed subtree on remove", () => {
    const router = makeRouter([...BASE_ROUTES]);
    const routesApi = getRoutesApi(router);

    let captured: TreeChangedEvent | undefined;

    routesApi.subscribeChanges((event) => {
      captured = event;
    });

    routesApi.remove("users");

    const event = asOp(captured, "remove");

    expect(event.name).toBe("users");
    expect(
      event.removedSubtree.map((route) => route.name).toSorted(byName),
    ).toStrictEqual(["users", "users.view"]);
  });
});
