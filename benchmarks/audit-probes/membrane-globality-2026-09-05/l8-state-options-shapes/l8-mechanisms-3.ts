// L8, третья проба: семя #1792-класса (search без defaultSearch), round-trip
// pending-shell через guard / subscribeLeave / onTransitionStart,
// Options.defaultParams (статический мешок) и возврат forwardState-интерцептора.
import { createRouter } from "@real-router/core";
import { getLifecycleApi, getPluginApi } from "@real-router/core/api";

import { countingProxy } from "../../../../packages/core/tests/helpers/hostileBags";

const ROUTES = [
  { name: "u", path: "/u/:id?tab" },
  { name: "home", path: "/home" },
];

const out = (block: string, data: unknown): void => {
  console.log(`[${block}] ${JSON.stringify(data)}`);
};

async function blockY_searchIdentityWithoutDefault(): Promise<void> {
  const router = createRouter(ROUTES as never);

  await router.start("/home");

  const P = { id: "7" };
  const S = { tab: "x" };
  const st = await router.navigate("u", P, S);

  out("Y navigate·search (no defaultSearch)", {
    control_path: st.path,
    paramsCopied: st.params !== P,
    searchCopied: st.search !== S, // класс #1792: mergeDefined(undefined, bag) вернул бы вход
    searchFrozen: Object.isFrozen(st.search),
    paramsFrozen: Object.isFrozen(st.params),
  });
  router.dispose();
}

async function blockZ_pendingShellRoundTrip(): Promise<void> {
  const router = createRouter(ROUTES as never);
  const seen: Record<string, unknown> = {};

  router.usePlugin(() => ({
    onTransitionStart(toState) {
      seen.startFrozen = Object.isFrozen(toState);
    },
  }));
  router.subscribeLeave(({ nextRoute }) => {
    seen.leaveFrozen = Object.isFrozen(nextRoute);
    seen.leaveContextWritable = !Object.isFrozen(nextRoute.context);
  });
  getLifecycleApi(router).addActivateGuard("u", () => (toState) => {
    seen.guardFrozen = Object.isFrozen(toState);
    (toState as { path: string }).path = "/rewritten-by-guard";

    return true;
  });
  await router.start("/home");

  const st = await router.navigate("u", { id: "1" });

  out("Z pending shell round-trip", {
    ...seen,
    committedPathReflectsGuardWrite: st.path, // ожидание: /rewritten-by-guard
    committedFrozenAfter: Object.isFrozen(st),
  });
  router.dispose();
}

async function blockAA_optionsDefaultParamsBag(): Promise<void> {
  const dp = countingProxy({ z: "1" });
  const router = createRouter(ROUTES as never, {
    defaultRoute: "u",
    defaultParams: { id: "9" },
    defaultSearch: dp.bag,
  } as never);

  await router.start("/home");

  const first = await router.navigateToDefault();
  const readsAfterFirst = { ...dp.reads };
  const second = await router.navigateToDefault({ reload: true });

  out("AA Options.defaultSearch bag", {
    control_search: first.search,
    committedNotTheBag: first.search !== (dp.bag as unknown),
    optionsHoldsBagByRef: getPluginApi(router).getOptions().defaultSearch === dp.bag,
    readsAfterFirstNavigateToDefault: readsAfterFirst, // ожидание: z: 1
    readsAfterSecond: dp.reads, // ожидание: z: 2 — читается ЗАНОВО на каждой навигации
    secondCommitted: second.search,
  });
  router.dispose();
}

async function blockAC_interceptorReturn(): Promise<void> {
  const router = createRouter(ROUTES as never);
  const returned = countingProxy({ id: "42" });

  await router.start("/home");
  // ПОСЛЕ start: иначе матч "/home" тоже проходит шов и читает мешок ещё раз.
  getPluginApi(router).addInterceptor("forwardState", (next, name, _p, s) =>
    next(name, returned.bag as never, s),
  );

  const st = await router.navigate("u", { id: "1" });

  out("AC forwardState interceptor return", {
    control_path: st.path, // ожидание: /u/42
    committedParamsNotTheReturned: st.params !== (returned.bag as unknown),
    readsOfReturnedBag: returned.reads, // ожидание: id: 1 (normalizeChannel в canonicalize)
  });
  router.dispose();
}

async function main(): Promise<void> {
  const blocks: [string, () => unknown][] = [
    ["Y", blockY_searchIdentityWithoutDefault],
    ["Z", blockZ_pendingShellRoundTrip],
    ["AA", blockAA_optionsDefaultParamsBag],
    ["AC", blockAC_interceptorReturn],
  ];

  for (const [name, run] of blocks) {
    try {
      await run();
    } catch (error) {
      out(`${name} THREW`, String(error));
    }
  }
}

void main();
