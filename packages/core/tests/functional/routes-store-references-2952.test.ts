import { describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";
import { getRoutesApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

/**
 * The routes store seals every reference it carries for its doors (#2952).
 *
 * `getInternals(router).routeGetStore()` hands out the live store, and a door
 * reads each reference through it when called, so a replaced reference reaches
 * the door with nothing thrown. Each row tries the three write forms a slot
 * answers to: `writable: false` refuses the assignment, `configurable: false`
 * the redefinition and the delete.
 *
 * ⚑ The census of every slot, route state included, is the "published store"
 * cell of `state/query-strategy-formats-1796.test.ts`.
 *
 * ⚠ The level closed is the slot; the comment in `createRoutesStore` says which
 * of the objects behind the three is frozen.
 *
 * ⚠ Sloppy mode ignores the assignment and makes the `delete` return `false`;
 * only the redefinition throws there too.
 */
const REFERENCES = ["treeChanged", "lifecycleNamespace", "depsStore"] as const;

const storeOf = (router: ReturnType<typeof createRouter>) =>
  getInternals(router).routeGetStore() as unknown as Record<string, unknown>;

describe("#2952 — the routes store seals the references its doors reach", () => {
  it("the table holds all three references, so a dropped row reds", () => {
    expect(REFERENCES).toHaveLength(3);
  });

  it.each(REFERENCES)(
    "%s refuses every write form and keeps the original",
    (slot) => {
      const router = createRouter([{ name: "home", path: "/" }]);
      const store = storeOf(router);
      const original = store[slot];
      const impostor = {};

      // A slot sealed as `undefined` refuses every write too.
      expect(original).toBeTypeOf("object");
      expect(() => {
        store[slot] = impostor;
      }).toThrow(TypeError);
      expect(() =>
        Object.defineProperty(store, slot, { value: impostor }),
      ).toThrow(TypeError);
      expect(() => {
        delete store[slot];
      }).toThrow(TypeError);
      expect(store[slot]).toBe(original);

      router.dispose();
    },
  );

  it("the channel behind treeChanged refuses a write too, and the next mutation still reaches subscribeChanges", () => {
    const router = createRouter([{ name: "home", path: "/" }]);
    const store = storeOf(router);
    const channel = store.treeChanged as Record<string, unknown>;
    const heard: string[] = [];

    getRoutesApi(router).subscribeChanges((event) => {
      heard.push(event.op);
    });

    expect(channel).toBeTypeOf("object");
    expect(() => {
      store.treeChanged = { ...channel, emit: () => undefined };
    }).toThrow(TypeError);
    expect(() => {
      channel.emit = () => undefined;
    }).toThrow(TypeError);

    getRoutesApi(router).add({ name: "users", path: "/users" });

    expect(heard).toStrictEqual(["add"]);

    router.dispose();
  });
});
