// Цена (а) на дверях семейства, где ядро сегодня НЕ копирует контейнер целиком.
// A = дверь как сегодня (оригинал контейнера вызывающего);
// B = дверь с ДОБАВЛЕННОЙ мелкой копией контейнера на границе (эмуляция (а)
//     обёрткой, src не правится);
// A/A-пол = тот же арм A под вторым именем.
// Форма мешка — реальная для этой двери: params {id}, search {tab},
// segments {activated, deactivated, intersection}.
//
// Run: cd W/benchmarks && NODE_OPTIONS='--conditions=@real-router/internal-source' \
//   npx tsx audit-probes/membrane-globality-2026-09-05/cls-чужой-state-adoptforeignbag-и-его-уровни/cost.ts
import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";
import { bench, run, do_not_optimize } from "mitata";

import type { State } from "@real-router/core/types";

const ROUTES = [
  { name: "a", path: "/a" },
  { name: "u", path: "/u/:id?tab" },
] as never;

const mk = (): ReturnType<typeof createRouter> =>
  createRouter(ROUTES, { defaultRoute: "a" });

const navRouter = mk();
const scRouter = mk();

let n = 0;

function navState(copyAtBoundary: boolean): State {
  const params = { id: String(n++ % 100) };
  const search = { tab: "t" };
  const context = {};
  const shell = {
    name: "u",
    params: copyAtBoundary ? { ...params } : params,
    search: copyAtBoundary ? { ...search } : search,
    path: `/u/${params.id}?tab=t`,
    context: copyAtBoundary ? { ...context } : context,
    transition: { phase: "activating", reason: "success", segments: {} },
  };
  return (copyAtBoundary ? { ...shell } : shell) as unknown as State;
}

function scState(copySegments: boolean): State {
  const segments = { activated: ["u"], deactivated: [], intersection: "" };
  return {
    name: "u",
    params: { id: String(n++ % 100) },
    search: { tab: "s" },
    path: "/u/1?tab=s",
    context: {},
    transition: {
      phase: "activating",
      reason: "success",
      segments: copySegments ? { ...segments } : segments,
    },
  } as unknown as State;
}

async function main(): Promise<void> {
await navRouter.start("/a");
await scRouter.start("/a");
bench("A · navigateToState — оригинал контейнеров", async () => {
  do_not_optimize(await getPluginApi(navRouter).navigateToState(navState(false)));
});

bench("A/A · navigateToState — оригинал контейнеров (пол)", async () => {
  do_not_optimize(await getPluginApi(navRouter).navigateToState(navState(false)));
});

bench("B · navigateToState — копия контейнеров на границе", async () => {
  do_not_optimize(await getPluginApi(navRouter).navigateToState(navState(true)));
});

bench("A · systemCommit — segments по ссылке", () => {
  do_not_optimize(
    getInternals(scRouter).systemCommit(scState(false), scRouter.getState(), {
      replace: true,
    } as never),
  );
});

bench("A/A · systemCommit — segments по ссылке (пол)", () => {
  do_not_optimize(
    getInternals(scRouter).systemCommit(scState(false), scRouter.getState(), {
      replace: true,
    } as never),
  );
});

bench("B · systemCommit — копия segments на границе", () => {
  do_not_optimize(
    getInternals(scRouter).systemCommit(scState(true), scRouter.getState(), {
      replace: true,
    } as never),
  );
});

  await run();
}

void main();
