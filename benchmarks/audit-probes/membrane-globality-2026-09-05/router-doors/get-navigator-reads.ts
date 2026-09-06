// Door: getNavigator · router. Question: which slots of the argument are read, how many times,
// and is the argument itself held (WeakMap key by identity)?
import { createRouter, getNavigator } from "@real-router/core";

async function main(): Promise<void> {
  const router = createRouter([{ name: "home", path: "/home" }] as never);
  const reads: Record<string, number> = {};
  const proxied = new Proxy(router, {
    get(target, key, receiver): unknown {
      reads[String(key)] = (reads[String(key)] ?? 0) + 1;

      return Reflect.get(target, key, receiver);
    },
  });

  const nav1 = getNavigator(proxied as never);
  const afterFirst = { ...reads };
  const nav2 = getNavigator(proxied as never);
  const afterSecond = { ...reads };
  const navOfReal = getNavigator(router);

  await router.start("/home");

  console.log(
    JSON.stringify(
      {
        afterFirst,
        afterSecond,
        secondCallReadNothingMore:
          JSON.stringify(afterFirst) === JSON.stringify(afterSecond),
        cachedByIdentity: nav1 === nav2,
        proxyAndRealAreDifferentKeys: navOfReal !== nav1,
        navigatorFrozen: Object.isFrozen(nav1),
        navigatorKeys: Object.keys(nav1),
        positiveControl_getStateName: nav1.getState()?.name,
        positiveControl_isActive: nav1.isActiveRoute("home"),
      },
      null,
      2,
    ),
  );
  router.dispose();
}

void main();
