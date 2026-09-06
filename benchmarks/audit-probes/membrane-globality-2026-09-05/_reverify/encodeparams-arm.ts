// ОДНА арма на процесс — и один РОУТЕР на процесс, поэтому сайт вызова кодека
// остаётся мономорфным (в cost-ab.ts обе армы жили рядом, и он полиморфен).
import { createRouter } from "@real-router/core";
import { getInternals } from "@real-router/core/validation";

type Ch = { params: Record<string, unknown>; search: Record<string, unknown> };

let sink: unknown;

const arm = process.argv[2] ?? "A";
const iters = Number(process.argv[3] ?? 200_000);

const codec: (ch: Ch) => Ch =
  arm === "B"
    ? (ch) => ({ params: { ...ch.params }, search: { ...ch.search } })
    : (ch) => ch;

const router = createRouter(
  [{ name: "e", path: "/e/:id?tab", encodeParams: codec as never }] as never,
  {} as never,
);
const ctx = getInternals(router as never) as unknown as {
  matchPath: (p: string, o: unknown) => unknown;
  getOptions: () => Record<string, unknown>;
};
const opts = { ...ctx.getOptions(), rewritePathOnMatch: true };

// позитивный контроль: матч состоялся и параметр на месте
const probe = ctx.matchPath("/e/9?tab=x", opts) as { params?: Record<string, unknown> } | null;
if (!probe || probe.params?.id !== "9") {
  process.stderr.write("КОНТРОЛЬ ПРОВАЛЕН: матч не состоялся\n");
  process.exit(2);
}

const step = (): void => {
  sink = ctx.matchPath("/e/9?tab=x", opts);
};

for (let i = 0; i < 20_000; i++) step();

const t0 = process.hrtime.bigint();
for (let i = 0; i < iters; i++) step();
const t1 = process.hrtime.bigint();

void sink;
router.dispose();
process.stdout.write(String(Number(t1 - t0) / iters) + "\n");
