// ЦЕНА (а) на дверях семейства с alreadyCopied ≠ yes и горячим путём:
//   D2 createPluginBuildUrl·opts        (per-render через link-utils · buildHref)
//   D5 getRouteFromEvent·evt.state      (per-navigation, рукав popstate)
//   D6 canSkipPopstateHistoryWrite      (per-navigation, рукав popstate)
// A/B: дверь с ОРИГИНАЛОМ против двери с мелкой копией контейнера на границе
// (копия эмулируется обёрткой — src не правится). Чередование арм, медианы
// раундов, A/A-пол на том же входе.
import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

import { createPluginBuildUrl } from "../../../../shared/browser-env/plugin-utils";
import {
  canSkipPopstateHistoryWrite,
  getRouteFromEvent,
} from "../../../../shared/browser-env/popstate-utils";

import type { Browser } from "../../../../shared/browser-env/types";
import type { State } from "@real-router/core";

const ROUNDS = 15;
const ITERS = 20_000;

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);

  return s.length % 2 === 1
    ? s[(s.length - 1) / 2]
    : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

function ab(
  label: string,
  a: () => unknown,
  b: () => unknown,
): { label: string; aNs: number; bNs: number; deltaPct: number } {
  // прогрев обеих арм
  for (let i = 0; i < ITERS; i++) {
    a();
    b();
  }

  const aRounds: number[] = [];
  const bRounds: number[] = [];

  for (let r = 0; r < ROUNDS; r++) {
    let t0 = process.hrtime.bigint();

    for (let i = 0; i < ITERS; i++) {
      a();
    }

    aRounds.push(Number(process.hrtime.bigint() - t0) / ITERS);

    t0 = process.hrtime.bigint();

    for (let i = 0; i < ITERS; i++) {
      b();
    }

    bRounds.push(Number(process.hrtime.bigint() - t0) / ITERS);
  }

  const aNs = median(aRounds);
  const bNs = median(bRounds);

  return {
    label,
    aNs: Number(aNs.toFixed(2)),
    bNs: Number(bNs.toFixed(2)),
    deltaPct: Number((((bNs - aNs) / aNs) * 100).toFixed(2)),
  };
}

async function main(): Promise<void> {
  const router = createRouter(
    [
      { name: "home", path: "/" },
      { name: "u", path: "/u/:id?tab" },
    ] as never,
    {} as never,
  );

  await router.start("/u/1");

  const api = getPluginApi(router);
  const buildUrl = createPluginBuildUrl(router, "");

  // ── D2 · opts { hash } (реальная форма — один ключ) ───────────────────────
  const params = { id: "7" };
  const search = { tab: "x" };
  const opts = { hash: "sec" };

  const d2 = ab(
    "D2 createPluginBuildUrl·opts",
    () => buildUrl("u", params, search, opts),
    () => buildUrl("u", params, search, { ...opts }),
  );
  const d2aa = ab(
    "D2 A/A",
    () => buildUrl("u", params, search, opts),
    () => buildUrl("u", params, search, opts),
  );

  // ── D5 · evt.state (копия ВЛОЖЕННЫХ мешков; верхний уровень уже копируется) ─
  const entry = {
    name: "u",
    params: { id: "7" },
    search: { tab: "x" },
    path: "/u/7?tab=x",
  };
  const evt = { state: entry } as PopStateEvent;
  const d5 = ab(
    "D5 getRouteFromEvent·evt.state",
    () => getRouteFromEvent(evt, api, "/"),
    () =>
      getRouteFromEvent(
        {
          state: {
            ...entry,
            params: { ...entry.params },
            search: { ...entry.search },
          },
        } as PopStateEvent,
        api,
        "/",
      ),
  );
  const d5aa = ab(
    "D5 A/A",
    () => getRouteFromEvent(evt, api, "/"),
    () => getRouteFromEvent(evt, api, "/"),
  );

  // ── D6 · browser.getState() ───────────────────────────────────────────────
  const toState = router.getState() as State;
  const live = {
    name: "u",
    params: { id: "1" },
    search: {},
    path: toState.path,
  };
  const browserPlain = { getState: () => live } as unknown as Browser;
  const browserCopy = {
    getState: () => ({
      ...live,
      params: { ...live.params },
      search: { ...live.search },
    }),
  } as unknown as Browser;
  const d6 = ab(
    "D6 canSkipPopstateHistoryWrite·getState()",
    () =>
      canSkipPopstateHistoryWrite(toState, browserPlain, router.areStatesEqual),
    () =>
      canSkipPopstateHistoryWrite(toState, browserCopy, router.areStatesEqual),
  );
  // канон (а): копируется КОНТЕЙНЕР, листья — по ссылке
  const browserShallow = {
    getState: () => ({ ...live }),
  } as unknown as Browser;
  const d6shallow = ab(
    "D6 копия ТОЛЬКО контейнера (канон: листья по ссылке)",
    () =>
      canSkipPopstateHistoryWrite(toState, browserPlain, router.areStatesEqual),
    () =>
      canSkipPopstateHistoryWrite(toState, browserShallow, router.areStatesEqual),
  );
  const d6aa = ab(
    "D6 A/A",
    () =>
      canSkipPopstateHistoryWrite(toState, browserPlain, router.areStatesEqual),
    () =>
      canSkipPopstateHistoryWrite(toState, browserPlain, router.areStatesEqual),
  );

  console.log(
    JSON.stringify(
      {
        harness: `hand-rolled alternating-arm, ROUNDS=${ROUNDS}, ITERS=${ITERS}, медианы раундов, hrtime.bigint`,
        node: process.version,
        results: [d2, d2aa, d5, d5aa, d6, d6shallow, d6aa],
      },
      null,
      1,
    ),
  );
}

main().catch((error: unknown) => {
  console.error("BENCH FAILED", error);
  process.exitCode = 1;
});
