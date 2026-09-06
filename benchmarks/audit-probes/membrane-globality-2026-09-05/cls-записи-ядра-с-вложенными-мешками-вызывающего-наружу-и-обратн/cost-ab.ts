/**
 * ЦЕНА (а) для двух горячих дверей семейства.
 * Харнесс: чередование арм по раундам, медиана ns/оп, A/A-пол тем же кодом.
 *   D1 getRouteConfig·return — арма A: живая запись; арма B: `{ ...запись }` на выдаче.
 *   D3 matchPath·encodeParams — арма A: кодек получает canonical.path по ссылке;
 *      арма B: оба канала спредятся ПЕРЕД кодеком (та работа, что стоит на дуге buildPath).
 * Форма мешка — реальная для двери: 1-2 ключа.
 */
import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

const ROUNDS = 15;

let sink: unknown;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);

  return s[(s.length - 1) >> 1]!;
}

function timeNs(iter: number, fn: () => void): number {
  const t0 = process.hrtime.bigint();

  for (let i = 0; i < iter; i++) {
    fn();
  }

  return Number(process.hrtime.bigint() - t0) / iter;
}

function ab(
  name: string,
  iter: number,
  armA: () => void,
  armB: () => void,
): void {
  // прогрев
  for (let i = 0; i < 3; i++) {
    timeNs(iter, armA);
    timeNs(iter, armB);
  }

  const a: number[] = [];
  const b: number[] = [];
  const a2: number[] = [];

  for (let r = 0; r < ROUNDS; r++) {
    a.push(timeNs(iter, armA));
    b.push(timeNs(iter, armB));
    a2.push(timeNs(iter, armA));
  }

  const mA = median(a);
  const mB = median(b);
  const mA2 = median(a2);

  console.log(
    JSON.stringify({
      door: name,
      iterPerRound: iter,
      rounds: ROUNDS,
      baselineNs: +mA.toFixed(2),
      withCopyNs: +mB.toFixed(2),
      deltaPct: +(((mB - mA) / mA) * 100).toFixed(2),
      aaFloorPct: +(((mA2 - mA) / mA) * 100).toFixed(2),
      harness: "hand-rolled alternating A/B/A, hrtime.bigint, median of 15",
    }),
  );
}

// ------------------------------------------------------------------ D1
{
  const router = createRouter(
    [{ name: "a", path: "/a/:id", preload: () => undefined, searchSchema: "s" }] as never,
    {} as never,
  );
  const api = getPluginApi(router as never);

  // ПК: ветвь достигнута — запись действительно есть и несёт оба ключа
  const probe = api.getRouteConfig("a") as Record<string, unknown>;

  console.log(
    JSON.stringify({
      control_D1_recordKeys: Object.keys(probe),
      control_D1_copyEqual:
        JSON.stringify({ ...probe }) === JSON.stringify(probe),
    }),
  );

  ab(
    "PluginApi.getRouteConfig·return",
    20_000,
    () => {
      sink = api.getRouteConfig("a");
    },
    () => {
      const rec = api.getRouteConfig("a") as Record<string, unknown> | undefined;

      sink = rec === undefined ? undefined : { ...rec };
    },
  );
  router.dispose();
}

// D1 на ОДНОКЛЮЧЕВОЙ форме — то, что читает preload-plugin (`{ preload }`)
{
  const router = createRouter(
    [{ name: "a", path: "/a/:id", preload: () => undefined }] as never,
    {} as never,
  );
  const api = getPluginApi(router as never);

  console.log(
    JSON.stringify({
      control_D1_1key_recordKeys: Object.keys(
        api.getRouteConfig("a") as Record<string, unknown>,
      ),
    }),
  );

  ab(
    "PluginApi.getRouteConfig·return (1 ключ)",
    20_000,
    () => {
      sink = api.getRouteConfig("a");
    },
    () => {
      const rec = api.getRouteConfig("a") as Record<string, unknown> | undefined;

      sink = rec === undefined ? undefined : { ...rec };
    },
  );
  router.dispose();
}

// ------------------------------------------------------------------ D3
{
  type Ch = { params: Record<string, unknown>; search: Record<string, unknown> };

  const mkRouter = (
    codec: (ch: Ch) => Ch,
  ): {
    match: (p: string) => unknown;
    dispose: () => void;
  } => {
    const router = createRouter(
      [{ name: "e", path: "/e/:id?tab", encodeParams: codec as never }] as never,
      {} as never,
    );
    const ctx = getInternals(router as never) as unknown as {
      matchPath: (p: string, o: unknown) => unknown;
      getOptions: () => Record<string, unknown>;
    };
    const opts = { ...ctx.getOptions(), rewritePathOnMatch: true };

    return {
      match: (p) => ctx.matchPath(p, opts),
      dispose: () => {
        router.dispose();
      },
    };
  };

  const identity = mkRouter((ch) => ch);
  const copying = mkRouter((ch) => ({
    params: { ...ch.params },
    search: { ...ch.search },
  }));

  const st = identity.match("/e/9?tab=x") as {
    params: Record<string, unknown>;
    path: string;
  };

  console.log(
    JSON.stringify({
      control_D3_matched: { params: st.params, path: st.path },
      control_D3_copyArmSame: JSON.stringify(
        (copying.match("/e/9?tab=x") as { params: unknown; path: string }),
      ),
    }),
  );

  ab(
    "RoutesNamespace.matchPath·encodeParams·channels.params",
    5_000,
    () => {
      sink = identity.match("/e/9?tab=x");
    },
    () => {
      sink = copying.match("/e/9?tab=x");
    },
  );

  identity.dispose();
  copying.dispose();
}

if (sink === Symbol.for("never")) {
  console.log("unreachable");
}
