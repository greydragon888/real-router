// Триаж: RouterValidator.routes.validateIsActiveRouteArgs·params и
// RouterValidator.navigation.validateSearch·search@Router.isActiveRoute —
// хэндаут ОРИГИНАЛА мешка вызывающего в код плагина, который ядро ЧИТАЕТ
// ОБРАТНО ниже по кадру (this.#routes.isActiveRoute → normalizeChannel).
// Доказательство round-trip = вердикт МЕНЯЕТСЯ от мутации, сделанной
// плагином внутри валидатора.
import { createRouter } from "@real-router/core";
import { getInternals } from "@real-router/core/validation";

const routes = [
  { name: "a", path: "/a" },
  { name: "b", path: "/b/:id?q" },
];

const group = (mut?: (m: string, args: unknown[]) => void) =>
  new Proxy(
    {},
    {
      get:
        (_t, m) =>
        (...args: unknown[]) => {
          mut?.(String(m), args);
        },
    },
  );

async function main(): Promise<void> {
  const router = createRouter(routes as never, {} as never);
  const ctx = getInternals(router);
  await router.start("/b/1?q=x");

  const out: Record<string, unknown> = {};

  // Позитивный контроль 1: без валидатора вердикт по неизменённым мешкам.
  ctx.validator = null as never;
  out.control_noValidator_match = router.isActiveRoute(
    "b",
    { id: "1" },
    { q: "x" },
    true,
    false,
  );
  out.control_noValidator_mismatch = router.isActiveRoute(
    "b",
    { id: "9" },
    { q: "x" },
    true,
    false,
  );

  // Позитивный контроль 2: инертный валидатор (вызовы происходят, мутаций нет).
  let seen = 0;
  ctx.validator = new Proxy(
    {},
    {
      get: () =>
        group(() => {
          seen += 1;
        }),
    },
  ) as never;
  const P0 = { id: "1" };
  const S0 = { q: "x" };
  out.control_inertValidator_match = router.isActiveRoute(
    "b",
    P0,
    S0,
    true,
    false,
  );
  out.control_inertValidator_callsSeen = seen;

  // АРМ 1: валидатор params мутирует ПРИНЯТЫЙ контейнер вызывающего.
  const P1 = { id: "1" };
  const S1 = { q: "x" };
  let paramsArgSame: boolean | null = null;
  ctx.validator = new Proxy(
    {},
    {
      get: (_t, g) =>
        group((m, args) => {
          if (g === "routes" && m === "validateIsActiveRouteArgs") {
            paramsArgSame = args[1] === P1;
            (args[1] as Record<string, string>).id = "9"; // подмена ПОСЛЕ проверки
          }
        }),
    },
  ) as never;
  out.arm1_verdict = router.isActiveRoute("b", P1, S1, true, false);
  out.arm1_paramsArgIsCallerObject = paramsArgSame;
  out.arm1_callerBagAfterCall = { ...P1 };

  // АРМ 2: валидатор search мутирует контейнер вызывающего.
  const P2 = { id: "1" };
  const S2 = { q: "x" };
  let searchArgSame: boolean | null = null;
  ctx.validator = new Proxy(
    {},
    {
      get: (_t, g) =>
        group((m, args) => {
          if (g === "navigation" && m === "validateSearch") {
            searchArgSame = args[0] === S2;
            (args[0] as Record<string, string>).q = "ZZZ";
          }
        }),
    },
  ) as never;
  out.arm2_verdict = router.isActiveRoute("b", P2, S2, true, false);
  out.arm2_searchArgIsCallerObject = searchArgSame;
  out.arm2_callerBagAfterCall = { ...S2 };

  // АРМ 3: ядро ниже по кадру копирует — мутация мешка ПОСЛЕ возврата на
  // предыдущий вердикт не влияет; пересчёт с испорченным мешком — влияет.
  ctx.validator = null as never;
  const P3 = { id: "1" };
  const v1 = router.isActiveRoute("b", P3, { q: "x" }, true, false);
  P3.id = "9";
  out.arm3_verdictBeforeMutation = v1;
  out.arm3_verdictRecomputedWithMutatedBag = router.isActiveRoute(
    "b",
    P3,
    { q: "x" },
    true,
    false,
  );

  console.log(JSON.stringify(out, null, 1));
}

void main();
