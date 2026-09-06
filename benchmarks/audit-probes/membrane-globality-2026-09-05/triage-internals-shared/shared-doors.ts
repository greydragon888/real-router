// Триаж дверей `shared/`: сколько раз ядро/шэрд читает объект вызывающего и
// копируется ли контейнер на границе.
//   D1 getRouteFromEvent·evt.state
//   D2 canSkipPopstateHistoryWrite·browser.getState()
//   D3 createPluginBuildUrl·params|search
//   D4 buildHref·routeParams|routeSearch
//   D5 navigateWithHash·routeParams|routeSearch
//   D6 navigateWithHash·extraOptions
//   D7 createReplaceHistoryState·params|search
import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

import { countingBag, driftingBag } from "../../../../packages/core/tests/helpers/hostileBags";
import { buildHref, navigateWithHash } from "../../../../shared/dom-utils/link-utils";
import {
  createPluginBuildUrl,
  createReplaceHistoryState,
} from "../../../../shared/browser-env/plugin-utils";
import {
  canSkipPopstateHistoryWrite,
  getRouteFromEvent,
} from "../../../../shared/browser-env/popstate-utils";

const out: Record<string, unknown> = {};

async function main(): Promise<void> {
const routes = [
  { name: "u", path: "/u/:id?tab" },
  { name: "home", path: "/" },
] as never;

// ---------- D1 getRouteFromEvent·evt.state ----------
{
  const router = createRouter(routes, {} as never);
  const api = getPluginApi(router as never);

  // ПОЗИТИВНЫЙ КОНТРОЛЬ: легальная запись доходит до State.
  const okState = getRouteFromEvent(
    { state: { name: "u", params: { id: "1" }, search: { tab: "a" }, path: "/u/1?tab=a" } } as never,
    api as never,
    "/u/1",
  );
  out.D1_control_name = okState?.name;
  out.D1_control_params = okState?.params;

  // СЧЁТ: сколько раз читается КАЖДЫЙ ключ вложенного мешка params.
  const p = countingBag({ id: "1" });
  const s = countingBag({ tab: "a" });
  const st = getRouteFromEvent(
    { state: { name: "u", params: p.bag, search: s.bag, path: "/u/1?tab=a" } } as never,
    api as never,
    "/u/1",
  );
  out.D1_reachedBranch = st !== undefined;
  out.D1_paramsKeyReads = { ...p.reads };
  out.D1_searchKeyReads = { ...s.reads };

  // ДРЕЙФ: гвард одобряет одно значение, State несёт другое.
  const d = driftingBag({ id: "APPROVED" }, { id: "COMMITTED" });
  const drifted = getRouteFromEvent(
    { state: { name: "u", params: d.bag, search: {}, path: "/u/APPROVED" } } as never,
    api as never,
    "/u/1",
  );
  out.D1_driftKeyReads = { ...d.reads };
  out.D1_driftCommittedParams = drifted?.params;
  out.D1_driftPath = drifted?.path;
}

// ---------- D2 canSkipPopstateHistoryWrite·browser.getState() ----------
{
  const router = createRouter(routes, {} as never);
  const toState = getPluginApi(router as never).makeState("u", { id: "1" }, { tab: "a" }, "/u/1?tab=a");

  // ПОЗИТИВНЫЙ КОНТРОЛЬ: идентичная живая запись → пропуск записи истории.
  const controlLive = { name: "u", params: { id: "1" }, search: { tab: "a" }, path: "/u/1?tab=a" };
  out.D2_control_skip = canSkipPopstateHistoryWrite(
    toState as never,
    { getState: () => controlLive } as never,
    (a, b, ig) => router.areStatesEqual(a as never, b as never, ig),
  );

  // СЧЁТ по верхнему уровню записи браузера.
  const shell = countingBag({ name: "u", params: { id: "1" }, search: { tab: "a" }, path: "/u/1?tab=a" });
  const skip = canSkipPopstateHistoryWrite(
    toState as never,
    { getState: () => shell.bag } as never,
    (a, b, ig) => router.areStatesEqual(a as never, b as never, ig),
  );
  out.D2_skip = skip;
  out.D2_shellKeyReads = { ...shell.reads };

  // ДРЕЙФ: гвард видит одно `path`, сравнение — другое.
  const drift = driftingBag(
    { name: "u", params: { id: "1" }, search: { tab: "a" }, path: "/SOMETHING/ELSE" },
    { path: "/u/1?tab=a" },
  );
  out.D2_driftSkip = canSkipPopstateHistoryWrite(
    toState as never,
    { getState: () => drift.bag } as never,
    (a, b, ig) => router.areStatesEqual(a as never, b as never, ig),
  );
  out.D2_driftKeyReads = { ...drift.reads };
}

// ---------- D3 createPluginBuildUrl·params|search ----------
{
  const router = createRouter(routes, {} as never);
  const buildUrl = createPluginBuildUrl(router as never, "/app");

  out.D3_control = buildUrl("u", { id: "1" }, { tab: "a" });

  const p = countingBag({ id: "1" });
  const s = countingBag({ tab: "a" });
  out.D3_url = buildUrl("u", p.bag as never, s.bag as never);
  out.D3_paramsKeyReads = { ...p.reads };
  out.D3_searchKeyReads = { ...s.reads };
}

// ---------- D4 buildHref·routeParams|routeSearch (без buildUrl-расширения) ----------
{
  const router = createRouter(routes, {} as never);

  out.D4_control = buildHref(router as never, "u", { id: "1" }, { tab: "a" });

  const p = countingBag({ id: "1" });
  const s = countingBag({ tab: "a" });
  out.D4_href = buildHref(router as never, "u", p.bag as never, s.bag as never);
  out.D4_paramsKeyReads = { ...p.reads };
  out.D4_searchKeyReads = { ...s.reads };
}

// ---------- D5/D6 navigateWithHash ----------
{
  const router = createRouter(routes, {} as never);
  await router.start("/u/1?tab=a");

  out.D5_control = (await navigateWithHash(
    router as never,
    "u",
    { id: "2" },
    { tab: "b" },
    undefined,
    undefined,
  )).path;

  // Не-same-location рукав: обе двери ядра (isActiveRoute + navigate) над ОДНИМ мешком.
  const p = countingBag({ id: "3" });
  const s = countingBag({ tab: "c" });
  const opt = countingBag({ replace: true, custom: { keep: "identity" } });
  const st = await navigateWithHash(
    router as never,
    "u",
    p.bag as never,
    s.bag as never,
    undefined,
    opt.bag as never,
  );
  out.D5_landedPath = st.path;
  out.D5_paramsKeyReads = { ...p.reads };
  out.D5_searchKeyReads = { ...s.reads };
  out.D6_optionsKeyReads = { ...opt.reads };

  // Same-location рукав (байпас): предикат ДА → тот же мешок идёт в navigate.
  const p2 = countingBag({ id: "3" });
  const s2 = countingBag({ tab: "c" });
  await navigateWithHash(
    router as never,
    "u",
    p2.bag as never,
    s2.bag as never,
    "frag",
    undefined,
  );
  out.D5_sameLocation_paramsKeyReads = { ...p2.reads };
  out.D5_sameLocation_searchKeyReads = { ...s2.reads };
}

// ---------- D7 createReplaceHistoryState·params|search ----------
{
  const router = createRouter(routes, {} as never);
  const api = getPluginApi(router as never);
  let written: unknown;
  const browser = {
    replaceState: (state: unknown) => {
      written = JSON.parse(JSON.stringify(state));
    },
    getHash: () => "",
  };
  const replaceHistoryState = createReplaceHistoryState(
    api as never,
    browser as never,
    (path: string) => path,
  );

  replaceHistoryState("u", { id: "1" }, { tab: "a" });
  out.D7_control = written;

  const p = countingBag({ id: "9" });
  const s = countingBag({ tab: "z" });
  replaceHistoryState("u", p.bag as never, s.bag as never);
  out.D7_written = written;
  out.D7_paramsKeyReads = { ...p.reads };
  out.D7_searchKeyReads = { ...s.reads };
}

}

void main().then(() => {
  console.log(JSON.stringify(out, null, 1));
});
