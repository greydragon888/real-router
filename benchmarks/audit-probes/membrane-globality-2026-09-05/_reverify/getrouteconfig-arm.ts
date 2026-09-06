// ОДНА арма на процесс. Нагрузка воспроизведена из
// cls-записи-ядра-…/cost-ab.ts (D1), итераций ×150 — 15 нс/оп требует.
import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

let sink: unknown;

const arm = process.argv[2] ?? "A";
const iters = Number(process.argv[3] ?? 3_000_000);

const router = createRouter(
  [{ name: "a", path: "/a/:id", preload: () => undefined, searchSchema: "s" }] as never,
  {} as never,
);
const api = getPluginApi(router as never);

// позитивный контроль: запись есть и несёт оба ключа
const probe = api.getRouteConfig("a") as Record<string, unknown>;
if (Object.keys(probe).length < 2) {
  process.stderr.write("КОНТРОЛЬ ПРОВАЛЕН: запись пуста\n");
  process.exit(2);
}

const step =
  arm === "B"
    ? (): void => {
        const rec = api.getRouteConfig("a") as Record<string, unknown> | undefined;

        sink = rec === undefined ? undefined : { ...rec };
      }
    : (): void => {
        sink = api.getRouteConfig("a");
      };

for (let i = 0; i < 300_000; i++) step();

const t0 = process.hrtime.bigint();
for (let i = 0; i < iters; i++) step();
const t1 = process.hrtime.bigint();

void sink;
router.dispose();
process.stdout.write(String(Number(t1 - t0) / iters) + "\n");
