// Цена (а) на оси ШЕЛЛ этого семейства с A/A-полом.
// Арм A и A' — идентичный базовый навигационный цикл (пол шума);
// арм B — тот же цикл плюс мелкая копия шелла (листья по ссылке) — форма (а):
// приложению отдаётся копия, ядро коммитит свой объект.
// Реальная форма мешка двери: params 1 ключ, search 1 ключ.
//
// Run: cd W/benchmarks && NODE_OPTIONS='--conditions=@real-router/internal-source' \
//   npx tsx audit-probes/membrane-globality-2026-09-05/cls-pending-шелл-наружу-один-объект-11-путей/cost.ts
import { bench, do_not_optimize, run } from "mitata";

import { createRouter } from "@real-router/core";

import type { State } from "@real-router/core/types";

const freeze = Object.freeze;

function copyShell(s: State): State {
  return freeze({
    name: s.name,
    params: s.params,
    search: s.search,
    path: s.path,
    context: s.context,
    transition: s.transition,
  }) as State;
}

async function mkRouter(): Promise<{ router: ReturnType<typeof createRouter>; next: () => [string, { id: string }] }> {
  const router = createRouter(
    [
      { name: "a", path: "/a/:id?tab" },
      { name: "b", path: "/b/:id?tab" },
    ] as never,
    {} as never,
  );

  await router.start("/a/1?tab=x");

  let flip = false;
  const next = (): [string, { id: string }] => {
    flip = !flip;

    return [flip ? "b" : "a", { id: flip ? "2" : "1" }];
  };

  return { router, next };
}

async function main(): Promise<void> {
  const A = await mkRouter();
  const A2 = await mkRouter();
  const B = await mkRouter();
  const B2 = await mkRouter();
  const C = await mkRouter();

  bench("A  · navigate (baseline)", () => {
    const [n, p] = A.next();

    void A.router.navigate(n, p as never, { tab: "x" } as never);
    do_not_optimize(A.router.getState());
  });

  bench("A' · navigate (A/A floor arm)", () => {
    const [n, p] = A2.next();

    void A2.router.navigate(n, p as never, { tab: "x" } as never);
    do_not_optimize(A2.router.getState());
  });

  bench("B  · navigate + copyShell (strategy (а), leaves by reference)", () => {
    const [n, p] = B.next();

    void B.router.navigate(n, p as never, { tab: "x" } as never);
    do_not_optimize(copyShell(B.router.getState()!));
  });

  bench("B2 · navigate + copyShell, scalar sink (retention removed)", () => {
    const [n, p] = B2.next();

    void B2.router.navigate(n, p as never, { tab: "x" } as never);
    do_not_optimize(copyShell(B2.router.getState()!).name);
  });

  bench("C  · navigate + { ...context } (strategy (а) on the .context axis)", () => {
    const [n, p] = C.next();

    void C.router.navigate(n, p as never, { tab: "x" } as never);
    do_not_optimize({ ...(C.router.getState()!.context as Record<string, unknown>) });
  });

  await run();
}

void main();
