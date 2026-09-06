// L7-shared · семейство popstate: history.state → getRouteFromEvent → api.makeState
// → canonicalize/normalizeChannel (копия) → navigateToState → adoptForeignBag (копия №2).
// Плюс canSkipPopstateHistoryWrite: history.state читается ядром (areStatesEqual), не ложится.
import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

import {
  canSkipPopstateHistoryWrite,
  getRouteFromEvent,
} from "../../../../shared/browser-env/popstate-utils";
import {
  countingBag,
  driftingBag,
} from "../../../../packages/core/tests/helpers/hostileBags";

import type { Browser } from "../../../../shared/browser-env/types";

async function main(): Promise<void> {
  const router = createRouter(
    [{ name: "u", path: "/u/:id?tab" }] as never,
    {} as never,
  );

  await router.start("/u/1");

  const api = getPluginApi(router);
  const asEvent = (state: unknown): PopStateEvent =>
    ({ state }) as PopStateEvent;

  // A. ПОЗИТИВНЫЙ КОНТРОЛЬ: легальная запись восстанавливается; мешки — копии, заморожены.
  const plain = {
    name: "u",
    params: { id: "7" },
    search: { tab: "x" },
    path: "/u/7?tab=x",
  };
  const sA = getRouteFromEvent(asEvent(plain), api, "/");

  console.log(
    "A",
    JSON.stringify({
      name: sA?.name,
      path: sA?.path,
      paramsCopied: sA?.params !== plain.params,
      searchCopied: sA?.search !== plain.search,
      paramsFrozen: Object.isFrozen(sA?.params),
      searchFrozen: Object.isFrozen(sA?.search),
      params: sA?.params,
      search: sA?.search,
    }),
  );

  // B. СЧЁТ ЧТЕНИЙ: члены записи верхнего уровня и вложенные мешки.
  const params = countingBag({ id: "7" });
  const search = countingBag({ tab: "x" });
  const entry = countingBag({
    name: "u",
    params: params.bag,
    search: search.bag,
    path: "/u/7?tab=x",
  });
  const sB = getRouteFromEvent(asEvent(entry.bag), api, "/");

  console.log(
    "B",
    JSON.stringify({
      entryReads: entry.reads,
      paramsReads: params.reads,
      searchReads: search.reads,
      restored: sB?.name,
      identityParams: sB?.params === params.bag,
    }),
  );

  // C. ДРЕЙФ вложенного мешка: первое чтение (isParams) — примитив, второе (normalizeChannel) — функция.
  const drift = driftingBag({ id: "7" }, { id: (() => 1) as never });
  const sC = getRouteFromEvent(
    asEvent({ name: "u", params: drift.bag, search: {}, path: "/u/7" }),
    api,
    "/",
  );

  console.log(
    "C",
    JSON.stringify({
      reads: drift.reads,
      restored: sC?.name,
      committedIdType: typeof sC?.params.id,
    }),
  );

  // D. Вторая копия на navigateToState (adoptForeignBag): идентичность с makeState-мешками теряется.
  if (sB) {
    const committed = await api.navigateToState(sB, { replace: true });

    console.log(
      "D",
      JSON.stringify({
        sameParams: committed.params === sB.params,
        sameSearch: committed.search === sB.search,
        sameContext: committed.context === sB.context,
        committedFrozenParams: Object.isFrozen(committed.params),
        isGetState: router.getState() === committed,
      }),
    );
  }

  // E. canSkipPopstateHistoryWrite: сколько раз читается history.state (isStateStrict + сравнение).
  const liveParams = countingBag({ id: "7" });
  const liveSearch = countingBag({ tab: "x" });
  const live = countingBag({
    name: "u",
    params: liveParams.bag,
    search: liveSearch.bag,
    path: "/u/7?tab=x",
  });
  const browser = { getState: () => live.bag } as unknown as Browser;
  const toState = router.getState();

  if (toState) {
    const skip = canSkipPopstateHistoryWrite(
      toState,
      browser,
      router.areStatesEqual,
    );

    console.log(
      "E",
      JSON.stringify({
        skip,
        liveReads: live.reads,
        liveParamsReads: liveParams.reads,
        liveSearchReads: liveSearch.reads,
      }),
    );
  }
}

main().catch((error: unknown) => {
  console.error("PROBE FAILED", error);
  process.exitCode = 1;
});
