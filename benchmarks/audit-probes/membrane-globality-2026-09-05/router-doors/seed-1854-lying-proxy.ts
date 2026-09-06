// SEED #1854 (positive control of the lens): a Proxy whose `getOwnPropertyDescriptor` /
// `has` traps vouch for a key only its PROTOTYPE carries, handed as `params` and as `search`
// to `buildPath` and `navigate`. Historically the inherited key reached `state.params` while
// `state.path` printed without it. Today the channel copy is `Object.keys`-driven
// (`normalizeChannel`, helpers.ts), so `ownKeys` decides and the trap is never asked.
import { createRouter } from "@real-router/core";

const lyingProxy = (
  own: Record<string, unknown>,
  inherited: Record<string, unknown>,
): { bag: Record<string, unknown>; asked: string[] } => {
  const asked: string[] = [];
  const target = Object.assign(Object.create(inherited) as Record<string, unknown>, own);
  const bag = new Proxy(target, {
    getOwnPropertyDescriptor(t, key): PropertyDescriptor | undefined {
      asked.push(`gOPD:${String(key)}`);

      if (typeof key === "string" && key in inherited) {
        // The LIE: report the inherited key as an own enumerable data property.
        return {
          value: inherited[key],
          enumerable: true,
          configurable: true,
          writable: true,
        };
      }

      return Reflect.getOwnPropertyDescriptor(t, key);
    },
    has(t, key): boolean {
      asked.push(`has:${String(key)}`);

      return Reflect.has(t, key);
    },
    ownKeys(t): (string | symbol)[] {
      asked.push("ownKeys");

      return Reflect.ownKeys(t);
    },
  });

  return { bag, asked };
};

async function main(): Promise<void> {
  const router = createRouter(
    [
      { name: "home", path: "/home" },
      { name: "u", path: "/u/:id?tab" },
    ] as never,
    { queryParamsMode: "loose" } as never,
  );

  await router.start("/home");

  // params: own `id`, inherited `leaked` vouched for by the trap.
  const p1 = lyingProxy({ id: "7" }, { leaked: "L" });
  const hrefParams = router.buildPath("u", p1.bag as never);
  const p2 = lyingProxy({ id: "7" }, { leaked: "L" });
  const navParams = await router.navigate("u", p2.bag as never);

  // search: NO own key, inherited DECLARED `tab` vouched for by the trap.
  const s1 = lyingProxy({}, { tab: "L" });
  const hrefSearch = router.buildPath("u", { id: "7" }, s1.bag as never);
  const s2 = lyingProxy({}, { tab: "L" });
  const navSearch = await router.navigate(
    "u",
    { id: "8" },
    s2.bag as never,
  );

  // POSITIVE CONTROL: the same keys as OWN properties do reach the URL and the state.
  const controlHref = router.buildPath("u", { id: "7", leaked: "L" }, { tab: "x" });
  const controlNav = await router.navigate("u", { id: "9", leaked: "L" }, { tab: "x" });

  router.dispose();

  console.log(
    JSON.stringify(
      {
        params: {
          buildPath: hrefParams,
          buildPathTrapsAsked: p1.asked,
          navigateStateParamsKeys: Object.keys(navParams.params),
          navigatePath: navParams.path,
          navigateTrapsAsked: p2.asked,
        },
        search: {
          buildPath: hrefSearch,
          buildPathTrapsAsked: s1.asked,
          navigateStateSearchKeys: Object.keys(navSearch.search),
          navigatePath: navSearch.path,
          navigateTrapsAsked: s2.asked,
        },
        positiveControl: {
          href: controlHref,
          stateParamsKeys: Object.keys(controlNav.params),
          stateSearch: controlNav.search,
          path: controlNav.path,
        },
      },
      null,
      2,
    ),
  );
}

void main();
