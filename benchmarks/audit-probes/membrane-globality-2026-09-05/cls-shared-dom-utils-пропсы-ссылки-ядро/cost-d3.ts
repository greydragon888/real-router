// ЦЕНА (а) на двери D3 `navigateWithHash·routeParams|routeSearch` —
// единственной двери семейства с alreadyCopied = partial на горячем пути
// (click-хендлер <Link> шести адаптеров).
//
// Арма A (baseline): мешки приложения передаются в navigateWithHash как есть —
//   их читают ДВЕ двери ядра (isActiveRoute, затем navigate) на bypass-рукаве.
// Арма B (withCopy): мелкая копия контейнеров на границе shared ({...params},
//   {...search}) — эмуляция стратегии (а) БЕЗ правки src.
// Пол A/A: две одинаковые армы A.
//
// Форма мешка — реальная для этой двери: 1 ключ params + 1 ключ search (#1901:
// «Мешок маршрута — один-два ключа, не пять»).
// Чередование арм, медианы по батчам.
import { createRouter } from "@real-router/core";

import { navigateWithHash } from "../../../../shared/dom-utils/link-utils";

import type { Params, SearchParams } from "@real-router/core";

const routes = [
  { name: "home", path: "/" },
  { name: "u", path: "/u/:id?tab" },
];

const BATCH = 200;
const SAMPLES = 15;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);

  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
}

async function makeRouter(): Promise<ReturnType<typeof createRouter>> {
  const r = createRouter(routes as never, {} as never);

  await r.start("/u/7?tab=x");

  return r;
}

type Arm = (
  r: ReturnType<typeof createRouter>,
  p: Params,
  s: SearchParams,
  hash: string,
) => Promise<unknown>;

const armOriginal: Arm = (r, p, s, hash) =>
  navigateWithHash(r, "u", p, s, hash, undefined);

const armCopy: Arm = (r, p, s, hash) =>
  navigateWithHash(r, "u", { ...p }, { ...s } as SearchParams, hash, undefined);

async function batch(
  arm: Arm,
  r: ReturnType<typeof createRouter>,
): Promise<number> {
  const p: Params = { id: "7" };
  const s = { tab: "x" } as unknown as SearchParams;
  const t0 = performance.now();

  for (let i = 0; i < BATCH; i++) {
    // Хэш чередуется, чтобы bypass срабатывал на КАЖДОЙ итерации
    // (same-location + другой фрагмент) — это и есть рукав с двумя чтениями.
    await arm(r, p, s, i % 2 === 0 ? "h1" : "h2");
  }

  return performance.now() - t0;
}

async function main(): Promise<void> {
  const r = await makeRouter();

  // Позитивный контроль: обе армы реально коммитят навигацию и bypass живой.
  const stA = await armOriginal(r, { id: "7" }, { tab: "x" } as never, "zz1");
  const stB = await armCopy(r, { id: "7" }, { tab: "x" } as never, "zz2");

  console.log(
    "PC",
    JSON.stringify({
      armOriginalPath: stA.path,
      armCopyPath: stB.path,
      armOriginalName: stA.name,
      armCopyName: stB.name,
    }),
  );

  // Прогрев
  for (let i = 0; i < 5; i++) {
    await batch(armOriginal, r);
    await batch(armCopy, r);
  }

  const a: number[] = [];
  const b: number[] = [];
  const aa: number[] = [];

  for (let i = 0; i < SAMPLES; i++) {
    a.push(await batch(armOriginal, r));
    b.push(await batch(armCopy, r));
    aa.push(await batch(armOriginal, r));
  }

  const mA = median(a);
  const mB = median(b);
  const mAA = median(aa);
  const perNav = (ms: number): number => (ms * 1e6) / BATCH; // ns/навигация

  console.log(
    JSON.stringify(
      {
        harness: "самописный: батч 200 навигаций, 15 сэмплов, чередование A/B/A, медианы, performance.now",
        shape: "params {id} × search {tab} — 1+1 ключ, bypass-рукав (isActiveRoute + navigate)",
        baselineNs: Math.round(perNav(mA)),
        withCopyNs: Math.round(perNav(mB)),
        deltaPct: Number((((mB - mA) / mA) * 100).toFixed(2)),
        aaFloorPct: Number((((mAA - mA) / mA) * 100).toFixed(2)),
        medians: { A: mA, B: mB, A2: mAA },
      },
      null,
      1,
    ),
  );
}

main().catch((error: unknown) => {
  console.error("PROBE FAILED", error);
  process.exitCode = 1;
});
