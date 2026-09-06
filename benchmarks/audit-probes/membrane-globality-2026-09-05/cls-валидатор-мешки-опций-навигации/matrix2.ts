// Матрица семейства «валидатор·мешки-опций-навигации», часть 2.
//
// C1 — изоляция D2 (validateNavigateToDefaultArgs): сколько ключей читает
//      САМ этот проход (ожидание по исходнику: ноль — только typeof).
// C2 — round-trip D2/D1/D3/D4 исполнением: валидатор ДОПИСЫВАЕТ reload в
//      полученный контейнер; вердикт ядра меняется ⇒ ядро прочло контейнер
//      ПОСЛЕ чужого кадра. Контрольная арма — та же дорога без мутации.
// C3 — ЦЕНА (а) на горячей арке D1: navigate с копией контейнера НА ГРАНИЦЕ
//      (adoptNavigationOptions до фасада) против baseline; A/A-пол.
//
// Run: cd W/benchmarks && NODE_OPTIONS='--conditions=@real-router/internal-source' \
//  npx tsx audit-probes/membrane-globality-2026-09-05/cls-валидатор-мешки-опций-навигации/matrix2.ts
import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

import { validationPlugin } from "../../../../packages/validation-plugin/src/index";
import { adoptNavigationOptions } from "../../../../packages/core/src/helpers";
import { countingBag } from "../../../../packages/core/tests/helpers/hostileBags";

import type { NavigationOptions } from "@real-router/core/types";

const ROUTES = [
  { name: "a", path: "/a" },
  { name: "b", path: "/b" },
] as never;

const out = (section: string, facts: Record<string, unknown>): void => {
  console.log(`\n## ${section}`);
  for (const [k, v] of Object.entries(facts)) {
    console.log(`  ${k} = ${JSON.stringify(v)}`);
  }
};

const mkRouter = () => createRouter(ROUTES, { defaultRoute: "a" });

const fail = (e: unknown): string =>
  `rejected:${(e as { code?: string }).code ?? String(e).slice(0, 70)}`;

const settleFn = async (f: () => Promise<unknown>): Promise<string> => {
  try {
    await f();

    return "resolved";
  } catch (e) {
    return fail(e);
  }
};

/** Валидатор-заглушка: любой метод — no-op, кроме перечисленных в `impl`. */
function installValidator(
  router: unknown,
  impl: Record<string, (args: unknown[]) => void>,
): void {
  const validator = new Proxy(
    {},
    {
      get: (_t, group) =>
        new Proxy(
          {},
          {
            get:
              (_t2, m) =>
              (...args: unknown[]) => {
                impl[`${String(group)}.${String(m)}`]?.(args);
              },
          },
        ),
    },
  );
  (getInternals(router as never) as { validator?: unknown }).validator =
    validator;
}

async function main(): Promise<void> {
  // =============================================== C1 · изоляция D2
  {
    // Реальный плагин, но ЕГО ЖЕ validateNavigationOptions заглушён — остаётся
    // ровно один плагинный проход: validateNavigateToDefaultArgs (дверь D2).
    const r = mkRouter();
    r.usePlugin(validationPlugin());
    await r.start("/b");
    const v = (
      getInternals(r) as {
        validator: {
          navigation: Record<string, (...a: unknown[]) => void>;
        };
      }
    ).validator;
    const realToDefault = v.navigation.validateNavigateToDefaultArgs;
    v.navigation.validateNavigationOptions = () => {};
    const c = countingBag({ replace: true, reload: true });
    const res = await settleFn(() =>
      r.navigateToDefault(c.bag as NavigationOptions),
    );
    // позитивный контроль: реальный validateNavigateToDefaultArgs всё ещё судит
    let rejects = "нет";
    try {
      realToDefault("nope");
    } catch (e) {
      rejects = String(e).slice(0, 70);
    }
    out("C1 · D2 изолирован (validateNavigationOptions заглушён)", {
      C1_res: res,
      C1_readsPerKey: { ...c.reads },
      C1_positiveControl_realD2StillJudges: rejects,
      C1_note:
        "1 чтение = только ядро (adoptNavigationOptions); проход D2 ключей не читает",
    });
    r.stop();
  }

  // =============================================== C2 · round-trip исполнением
  {
    const rows: Record<string, unknown> = {};
    for (const arm of ["mutating", "control"] as const) {
      const on = arm === "mutating";
      const mutate = (args: unknown[]): void => {
        if (on) (args[0] as Record<string, unknown>).reload = true;
      };

      // D1 — navigate в то же состояние
      {
        const r = mkRouter();
        await r.start("/a");
        await r.navigate("b");
        installValidator(r, { "navigation.validateNavigationOptions": mutate });
        rows[`D1_${arm}`] = await settleFn(() =>
          r.navigate("b", {}, {}, { replace: true }),
        );
        r.stop();
      }
      // D2 — сырой аргумент navigateToDefault
      {
        const r = mkRouter();
        await r.start("/a");
        installValidator(r, {
          "navigation.validateNavigateToDefaultArgs": mutate,
        });
        rows[`D2_${arm}`] = await settleFn(() =>
          r.navigateToDefault({ replace: true }),
        );
        r.stop();
      }
      // D3 — второй читатель того же контейнера в том же кадре
      {
        const r = mkRouter();
        await r.start("/a");
        installValidator(r, { "navigation.validateNavigationOptions": mutate });
        rows[`D3_${arm}`] = await settleFn(() =>
          r.navigateToDefault({ replace: true }),
        );
        r.stop();
      }
      // D4 — PluginApi.navigateToState в то же состояние
      {
        const r = mkRouter();
        await r.start("/a");
        await r.navigate("b");
        const api = getPluginApi(r);
        installValidator(r, { "navigation.validateNavigationOptions": mutate });
        rows[`D4_${arm}`] = await settleFn(() =>
          api.navigateToState(api.makeState("b", {}, {}, "/b"), {
            replace: true,
          }),
        );
        r.stop();
      }
    }
    out("C2 · round-trip: валидатор дописал reload — вердикт ядра изменился", rows);
  }

  // =============================================== C3 · цена (а) на арке D1
  {
    // Реальная форма мешка этой двери: link-utils.ts кликом подаёт
    // { replace } / { force } — один ключ.
    // ⚠ Мешок создаётся СВЕЖИМ на каждую навигацию в ОБЕИХ армах: реальный
    // вызывающий (link-utils на клике) строит литерал каждый раз, а переиспользование
    // одного объекта делает baseline неправдоподобно мономорфным и завышает дельту.
    const r = mkRouter();
    r.usePlugin(validationPlugin());
    await r.start("/a");

    let flip = false;
    const baseline = async (): Promise<unknown> => {
      flip = !flip;

      return r.navigate(
        flip ? "b" : "a",
        {},
        {},
        { replace: true } as NavigationOptions,
      );
    };
    const withCopy = async (): Promise<unknown> => {
      flip = !flip;

      return r.navigate(
        flip ? "b" : "a",
        {},
        {},
        adoptNavigationOptions({ replace: true } as NavigationOptions),
      );
    };

    const N = 2000;
    const timeIt = async (f: () => Promise<unknown>): Promise<number> => {
      const t0 = process.hrtime.bigint();
      for (let i = 0; i < N; i++) await f();

      return Number(process.hrtime.bigint() - t0) / N;
    };

    // Прогрев
    for (let i = 0; i < 3; i++) {
      await timeIt(baseline);
      await timeIt(withCopy);
    }

    const bases: number[] = [];
    const copies: number[] = [];
    const aa: number[] = [];
    for (let round = 0; round < 7; round++) {
      bases.push(await timeIt(baseline));
      copies.push(await timeIt(withCopy));
      aa.push(await timeIt(baseline));
    }
    const med = (xs: number[]): number =>
      [...xs].sort((x, y) => x - y)[Math.floor(xs.length / 2)]!;
    const b = med(bases);
    const c = med(copies);
    const a2 = med(aa);
    out("C3 · цена копии контейнера на границе, арка D1 (navigate + validation-plugin)", {
      harness:
        "process.hrtime.bigint · 2000 навигаций на замер · 7 чередующихся раундов · медиана",
      shape: "{ replace: true } — форма opts клика (shared/dom-utils · link-utils)",
      baselineNs: Number(b.toFixed(1)),
      withCopyNs: Number(c.toFixed(1)),
      deltaPct: Number((((c - b) / b) * 100).toFixed(2)),
      aaFloorPct: Number((((a2 - b) / b) * 100).toFixed(2)),
      rawBases: bases.map((x) => Number(x.toFixed(1))),
      rawCopies: copies.map((x) => Number(x.toFixed(1))),
      rawAA: aa.map((x) => Number(x.toFixed(1))),
      note: "эмуляция = ДВЕ копии (наша + горловая). Перенос существующего вызова выше валидатора добавляет НОЛЬ копий; это верхняя граница.",
    });
    r.stop();
  }
}

void main();
