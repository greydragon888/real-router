// L3-routes-api · возвраты колбэков конфига маршрута: `decodeParams` /
// `encodeParams` отдают `{ params, search }` — объекты, построенные приложением,
// которые ядро потребляет. Что с ними происходит: копия (normalizeChannel) или
// ручка; сколько читателей у каждого ключа.
import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

import { countingBag } from "../../../../packages/core/tests/helpers/hostileBags";

const out: Record<string, unknown> = {};

// ── decodeParams · return ──────────────────────────────────────────────────
{
  // `tab` объявлен ?query; в возвращённом params лежит `tab: undefined` —
  // форма, при которой канал-гвард `assertChannelCorrect("matchPath", …)` ЧИТАЕТ
  // ключ и пропускает (undefined = отсутствие), а копия читает его ещё раз.
  const params = countingBag({ id: "7", tab: undefined });
  const search = countingBag({ tab: "x" });
  let returned: { params: object; search: object } | undefined;
  const router = createRouter([
    {
      name: "u",
      path: "/u/:id?tab",
      decodeParams: (): { params: object; search: object } => {
        returned = { params: params.bag, search: search.bag };

        return returned;
      },
    },
  ] as never);

  const state = getPluginApi(router).matchPath("/u/7?tab=x");

  out["decode · decoder ran (control)"] = returned !== undefined;
  out["decode · return.params reads"] = { ...params.reads };
  out["decode · return.search reads"] = { ...search.reads };
  out["decode · state.params !== return.params (copied)"] =
    state !== undefined && state.params !== returned?.params;
  out["decode · state.search !== return.search (copied)"] =
    state !== undefined && state.search !== returned?.search;
  out["decode · committed state (control)"] = state && {
    name: state.name,
    params: state.params,
    search: state.search,
    path: state.path,
    frozenParams: Object.isFrozen(state.params),
    frozenSearch: Object.isFrozen(state.search),
  };
  router.dispose();
}

// ── decodeParams · return, without the declared-key-in-params shape (control) ──
{
  const params = countingBag({ id: "7" });
  const search = countingBag({ tab: "x" });
  const router = createRouter([
    {
      name: "u",
      path: "/u/:id?tab",
      decodeParams: (): object => ({ params: params.bag, search: search.bag }),
    },
  ] as never);

  getPluginApi(router).matchPath("/u/7?tab=x");
  out["decode CONTROL (no query twin in params) · return.params reads"] = {
    ...params.reads,
  };
  out["decode CONTROL · return.search reads"] = { ...search.reads };
  router.dispose();
}

// ── encodeParams · return, via buildPath ───────────────────────────────────
{
  const params = countingBag({ id: "7" });
  const search = countingBag({ tab: "x" });
  let ran = 0;
  const router = createRouter([
    {
      name: "u",
      path: "/u/:id?tab",
      encodeParams: (): object => {
        ran += 1;

        return { params: params.bag, search: search.bag };
      },
    },
  ] as never);

  const href = router.buildPath("u", { id: "0" }, { tab: "0" });

  out["encode · encoder ran (control)"] = ran;
  out["encode · href (built from the RETURNED bags, control)"] = href;
  out["encode · return.params reads"] = { ...params.reads };
  out["encode · return.search reads"] = { ...search.reads };
  router.dispose();
}

// ── encodeParams · return, via matchPath's rewritePathOnMatch ──────────────
{
  const params = countingBag({ id: "9" });
  const search = countingBag({ tab: "y" });
  const router = createRouter([
    {
      name: "u",
      path: "/u/:id?tab",
      encodeParams: (): object => ({ params: params.bag, search: search.bag }),
    },
  ] as never);

  const state = getPluginApi(router).matchPath("/u/7?tab=x");

  out["encode via matchPath · rewritten state.path (control)"] = state?.path;
  out["encode via matchPath · state.params (from the URL, not the encoder)"] =
    state?.params;
  out["encode via matchPath · return.params reads"] = { ...params.reads };
  out["encode via matchPath · return.search reads"] = { ...search.reads };
  router.dispose();
}

console.log(JSON.stringify(out, null, 2));
