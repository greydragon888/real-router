// Verifier probe: the classifier declared P2 for the two InterceptorFn doors by
// analogy with the shared enumeration primitive (its own `unverified` says so).
// Here a LYING proxy is fed into each of those two slots directly, plus an
// honest control on the same route, plus a semantic arm for the forwardTo
// callback door (original container vs a pre-copied one).
import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

type Bag = Record<string, unknown>;

const out = (l: string, v: unknown): void => {
  console.log(l, JSON.stringify(v));
};

// hides `secret` from ownKeys while hasOwn/get still answer for it
const lying = (t: Bag): Bag =>
  new Proxy(t, {
    ownKeys: (o) => Reflect.ownKeys(o).filter((k) => k !== "secret"),
    has: () => true,
    getOwnPropertyDescriptor: (o, k) =>
      k === "secret"
        ? { value: (o as Bag)["secret"], enumerable: true, configurable: true, writable: true }
        : Reflect.getOwnPropertyDescriptor(o, k),
  });

const ROUTES = (): unknown[] => [
  { name: "home", path: "/home" },
  { name: "u", path: "/u/:id?tab" },
  { name: "b", path: "/b/:id" },
  {
    name: "d",
    path: "/d/:id",
    forwardTo: (_g: unknown, p: Bag) => (p["id"] === "9" ? "home" : "b"),
  },
];

const mk = (): ReturnType<typeof createRouter> => createRouter(ROUTES() as never, {} as never);

void (async () => {
  // V1 — lying proxy RETURNED by the interceptor
  for (const honest of [false, true]) {
    const r = mk();

    await r.start("/home");

    const bag = { id: "7", secret: "S" } as Bag;
    const mine = honest ? bag : lying(bag);
    let ran = 0;

    getPluginApi(r).addInterceptor("forwardState", ((next: never, n: never, p: never, s: never) => {
      ran += 1;
      (next as unknown as (a: never, b: never, c: never) => unknown)(n, p, s);

      return { name: "u", params: mine, search: {} };
    }) as never);

    const st = (await r.navigate("u", { id: "0" } as never)) as unknown as {
      params: Bag;
      path: string;
    };

    out(`V1 interceptor RETURN slot (${honest ? "control honest" : "lying proxy"})`, {
      interceptorRan: ran,
      "Object.keys sees": Object.keys(mine),
      "hasOwn secret": Object.hasOwn(mine, "secret"),
      "state.params": { ...st.params },
      "state.path": st.path,
    });
    r.dispose();
  }

  // V2 — lying proxy handed to next() by the interceptor
  for (const honest of [false, true]) {
    const r = mk();

    await r.start("/home");

    const bag = { id: "7", secret: "S" } as Bag;
    const mine = honest ? bag : lying(bag);
    let ran = 0;

    getPluginApi(r).addInterceptor("forwardState", ((next: never, n: never) => {
      ran += 1;

      return (next as unknown as (a: never, b: never, c: never) => unknown)(
        n,
        mine as never,
        {} as never,
      );
    }) as never);

    const st = (await r.navigate("u", { id: "0" } as never)) as unknown as {
      params: Bag;
      path: string;
    };

    out(`V2 interceptor NEXT slot (${honest ? "control honest" : "lying proxy"})`, {
      interceptorRan: ran,
      "state.params": { ...st.params },
      "state.path": st.path,
    });
    r.dispose();
  }

  // V3 — semantics of strategy (a) on the forwardTo-callback door
  const obs = async (pre: boolean): Promise<unknown> => {
    const r = mk();

    await r.start("/home");

    const bag = { id: "7", extra: "e" } as Bag;
    const arg = pre ? { ...bag } : bag;
    const st = (await r.navigate("d", arg as never)) as unknown as {
      name: string;
      params: Bag;
      path: string;
    };
    const active = r.isActiveRoute("b", { id: "7" } as never);
    const href = r.buildPath("b", { id: "7" } as never);

    r.dispose();

    return {
      name: st.name,
      params: { ...st.params },
      path: st.path,
      active,
      href,
      "caller's own bag after the call": { ...bag },
    };
  };

  const a = await obs(false);
  const b = await obs(true);

  out("V3 (a) vs original on the forwardTo door — A", a);
  out("V3 (a) vs original on the forwardTo door — B(pre-copied)", b);
  out("V3 identical observables?", { same: JSON.stringify(a) === JSON.stringify(b) });
})();
