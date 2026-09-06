// ROUND-TRIP consumer of the gap object: `segmentParamsEqual` (transitionPath.ts)
// enumerates core's OWN `paramTypeMap` keys and reads the CALLER's `state.params`
// once per key — reached from the public door Router.shouldUpdateNode·(toState,fromState)
// (a known census id; its P1/P2 verdict is what this cell pins for the meta record's
// consumer). P1: exactly one `get` per declared key per state; P2: no `has` /
// `ownKeys` / `getOwnPropertyDescriptor` trap fires on the caller's bag — the key
// list comes from core's record, never from the caller. POSITIVE CONTROL: the
// verdict for node "u" flips with the value the proxy answers (equal ids → false,
// differing ids → true), so the reads counted are the reads that decided.
import { createRouter } from "@real-router/core";

interface Trap {
  get: Record<string, number>;
  has: number;
  ownKeys: number;
  getOwnPropertyDescriptor: number;
}

function counted(
  source: Record<string, unknown>,
): { bag: Record<string, unknown>; traps: Trap } {
  const traps: Trap = { get: {}, has: 0, ownKeys: 0, getOwnPropertyDescriptor: 0 };
  const bag = new Proxy(source, {
    get(target, key, receiver): unknown {
      if (typeof key === "string") {
        traps.get[key] = (traps.get[key] ?? 0) + 1;
      }

      return Reflect.get(target, key, receiver);
    },
    has(target, key): boolean {
      traps.has += 1;

      return Reflect.has(target, key);
    },
    ownKeys(target): (string | symbol)[] {
      traps.ownKeys += 1;

      return Reflect.ownKeys(target);
    },
    getOwnPropertyDescriptor(target, key): PropertyDescriptor | undefined {
      traps.getOwnPropertyDescriptor += 1;

      return Reflect.getOwnPropertyDescriptor(target, key);
    },
  });

  return { bag, traps };
}

async function main(): Promise<void> {
  const router = createRouter(
    [
      {
        name: "u",
        path: "/u/:id?tab",
        children: [{ name: "c", path: "/c/:cid?q" }],
      },
      { name: "home", path: "/home" },
    ] as never,
    {} as never,
  );

  await router.start("/u/1/c/2");

  const predU = router.shouldUpdateNode("u");
  const state = (params: Record<string, unknown>): { state: object; traps: Trap } => {
    const { bag, traps } = counted(params);

    return {
      state: { name: "u.c", params: bag, search: {}, path: "/u/x/c/y", context: {} },
      traps,
    };
  };

  const run = (
    toParams: Record<string, unknown>,
    fromParams: Record<string, unknown>,
  ): Record<string, unknown> => {
    const to = state(toParams);
    const from = state(fromParams);
    const verdict = predU(to.state as never, from.state as never);

    return { verdict, toReads: to.traps, fromReads: from.traps };
  };

  const out = {
    equalIds_expectFalse: run({ id: "1", cid: "2", extra: 1 }, { id: "1", cid: "2", extra: 2 }),
    differingIds_expectTrue: run({ id: "1", cid: "2" }, { id: "9", cid: "2" }),
    differingCidOnly_nodeU: run({ id: "1", cid: "3" }, { id: "1", cid: "2" }),
  };

  console.log(JSON.stringify(out, null, 2));
}

void main();
