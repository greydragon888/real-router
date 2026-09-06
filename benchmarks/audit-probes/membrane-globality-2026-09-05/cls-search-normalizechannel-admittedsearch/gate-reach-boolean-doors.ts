// Две двери семейства отдают наружу BOOLEAN, поэтому строка 0b матрицы на них
// не различила режимы (gateDiscriminates:false) — булев ответ не показывает,
// уронил ли гейт ключ. Это НЕ доказательство, что гейт не достигнут; это
// слепота инструмента. Здесь оба входа доводятся до наблюдаемого следствия.
//
// canNavigateTo·search — через canActivate-гвард, которому ядро отдаёт toState
// (единственный легальный наблюдатель транзиентного состояния этой двери).
// isActiveRoute·search — через выбор активного состояния, при котором дроп
// МЕНЯЕТ вердикт: активен /u/7 без query, спрашиваем про { zzz } (не объявлен).
import { createRouter } from "@real-router/core";

type Obs = Record<string, unknown>;

const ROUTES = [
  { name: "u", path: "/u/:id?tab" },
  { name: "plain", path: "/plain/:id" },
] as never;

const out: Record<string, unknown> = {};

function canNavigateToArm(mode: string): Obs {
  const seen: Obs[] = [];
  const routes = [
    {
      name: "u",
      path: "/u/:id?tab",
      // Гвард из КОНФИГА маршрута — ядро зовёт его с транзиентным toState,
      // единственным легальным наблюдателем query-канала этой двери.
      canActivate: () => (toState: Obs) => {
        seen.push({
          searchKeys: Object.keys((toState.search ?? {}) as object),
          path: toState.path,
        });
        return true;
      },
    },
    { name: "plain", path: "/plain/:id" },
  ] as never;
  const r = createRouter(routes, { queryParamsMode: mode } as never);
  r.start("/plain/1");
  const verdict = r.canNavigateTo("u", { id: "7" } as never, {
    tab: "x",
    zzz: "UNDECLARED",
  } as never);
  return { verdict, guardSawToState: seen };
}

function isActiveArm(mode: string): Obs {
  const r = createRouter(ROUTES, { queryParamsMode: mode } as never);
  // Активное состояние БЕЗ query — так дроп необъявленного ключа меняет вердикт.
  r.start("/u/7");
  return {
    activePath: (r.getState() as Obs | null)?.path,
    // позитивный контроль формы: объявленный ключ, которого в активном нет
    // ⚠ ignoreQueryParams по умолчанию TRUE — с ним query-канал не влияет на
    // вердикт вовсе и проба даёт ложный ноль. Пятый аргумент = false.
    declaredMismatch: r.isActiveRoute(
      "u",
      { id: "7" } as never,
      { tab: "x" } as never,
      false,
      false,
    ),
    // решающий вход: НЕобъявленный ключ
    undeclaredKey: r.isActiveRoute(
      "u",
      { id: "7" } as never,
      { zzz: "UNDECLARED" } as never,
      false,
      false,
    ),
    // контроль равенства: пустой мешок
    emptyBag: r.isActiveRoute(
      "u",
      { id: "7" } as never,
      {} as never,
      false,
      false,
    ),
  };
}

for (const mode of ["default", "loose"]) {
  let cn: unknown;
  try {
    cn = canNavigateToArm(mode);
  } catch (e) {
    cn = `THROW ${String((e as Error).message).slice(0, 120)}`;
  }
  out[`canNavigateTo·${mode}`] = cn;
  out[`isActiveRoute·${mode}`] = isActiveArm(mode);
}

console.log(JSON.stringify(out, null, 1));
