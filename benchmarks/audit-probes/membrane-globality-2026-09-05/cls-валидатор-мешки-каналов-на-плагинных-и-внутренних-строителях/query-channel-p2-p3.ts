// Addendum: P2 (lying Proxy) and P3 (inherited accessor / own "__proto__") on
// the QUERY channel — the half `matrix.ts` runs on the path channel only.
// Doors: D2 (search@makeState), D4 (routeSearch@forwardState),
// D5 (search@buildNavigationState) and the navigate arc's search bag.
import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { validationPlugin } from "@real-router/validation-plugin";

const ROUTES = [
  { name: "u", path: "/u/:id?tab" },
  { name: "home", path: "/home" },
];

const out = (tag: string, row: unknown): void => {
  console.log(`${tag} ${JSON.stringify(row)}`);
};

const mkValidated = async (): Promise<ReturnType<typeof createRouter>> => {
  const r = createRouter(ROUTES as never, {} as never);

  r.usePlugin(validationPlugin() as never);
  await r.start("/home");

  return r;
};

const lyingSearch = (): object => {
  const target: Record<string, unknown> = { tab: "a" };

  return new Proxy(target, {
    ownKeys: () => ["tab"], // "evil" is NEVER named
    getOwnPropertyDescriptor(t, key) {
      if (key === "evil") {
        return { value: "LEAKED", writable: true, enumerable: true, configurable: true };
      }

      return Reflect.getOwnPropertyDescriptor(t, key);
    },
    get(t, key, receiver) {
      if (key === "evil") {
        return "LEAKED";
      }

      return Reflect.get(t, key, receiver);
    },
  });
};

type Door = [
  string,
  (r: ReturnType<typeof createRouter>, s: object) => Promise<unknown> | unknown,
];

const DOORS: Door[] = [
  ["D2 makeState·search", (r, s) => getPluginApi(r).makeState("u", { id: "7" } as never, s as never, "/u/7")],
  ["D4 forwardState·routeSearch", (r, s) => getPluginApi(r).forwardState("u", { id: "7" } as never, s as never)],
  [
    "D5 buildNavigationState·search",
    (r, s) => getPluginApi(r).buildNavigationState("u", { id: "7" } as never, s as never),
  ],
  ["navigate·search", (r, s) => r.navigate("u", { id: "7" } as never, s as never)],
];

void (async () => {
  for (const [label, call] of DOORS) {
    const router = await mkValidated();
    let threw: string | undefined;
    let result: unknown;

    try {
      result = await call(router, lyingSearch());
    } catch (error) {
      threw = String(error).slice(0, 90);
    }

    const shipped =
      (result as { search?: Record<string, unknown> } | undefined)?.search ??
      (router.getState() as { search?: Record<string, unknown> } | undefined)?.search;

    out("Q-P2", {
      door: label,
      threw,
      shippedKeys: shipped ? Object.keys(shipped) : undefined,
      evilIsOwnOfShipped: shipped ? Object.hasOwn(shipped, "evil") : undefined,
      shippedIsCallerProxy: shipped !== undefined && typeof shipped === "object" && !Object.isFrozen(shipped),
      honestTabLanded: shipped?.tab,
    });
  }

  for (const [label, call] of DOORS) {
    const router = await mkValidated();
    let setterHits = 0;
    let threw: string | undefined;
    let result: unknown;

    try {
      Object.defineProperty(Object.prototype, "tab", {
        configurable: true,
        get: (): unknown => "AMBIENT",
        set: (): void => {
          setterHits += 1;
        },
      });

      try {
        result = await call(router, { tab: "a" });
      } catch (error) {
        threw = String(error).slice(0, 90);
      }
    } finally {
      delete (Object.prototype as Record<string, unknown>).tab;
    }

    const shipped =
      (result as { search?: Record<string, unknown> } | undefined)?.search ??
      (router.getState() as { search?: Record<string, unknown> } | undefined)?.search;

    out("Q-P3-accessor", {
      door: label,
      threw,
      setterHits,
      shippedIsOwnTab: shipped ? Object.hasOwn(shipped, "tab") : undefined,
      shippedTab: shipped?.tab,
    });
  }

  for (const [label, call] of DOORS) {
    const router = await mkValidated();
    const bag = JSON.parse('{"tab":"a","__proto__":{"pollutedQ":true}}') as object;
    let threw: string | undefined;
    let result: unknown;

    try {
      result = await call(router, bag);
    } catch (error) {
      threw = String(error).slice(0, 90);
    }

    const shipped =
      (result as { search?: Record<string, unknown> } | undefined)?.search ??
      (router.getState() as { search?: Record<string, unknown> } | undefined)?.search;

    out("Q-P3-proto", {
      door: label,
      threw,
      globalPolluted: ({} as Record<string, unknown>).pollutedQ !== undefined,
      shippedKeys: shipped ? Object.keys(shipped) : undefined,
      shippedHasOwnProtoKey: shipped ? Object.hasOwn(shipped, "__proto__") : undefined,
      shippedProtoIsPolluted:
        shipped === undefined
          ? undefined
          : (Object.getPrototypeOf(shipped) as Record<string, unknown> | null)?.pollutedQ !== undefined,
    });
  }
})();
