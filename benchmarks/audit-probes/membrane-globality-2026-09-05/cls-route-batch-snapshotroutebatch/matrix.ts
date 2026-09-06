// Классификация семейства «route-config·snapshotRouteBatch».
// Строки матрицы — двери (batch-массив / объект маршрута / children-массив)
// на трёх арках (createRouter, RoutesApi.add, RoutesApi.replace).
// Столбцы — эксперимент (а), P1, P2, P3, P4.
// В КАЖДОМ блоке позитивный контроль и доказательство, что вход дошёл до ветви.
import { createRouter } from "@real-router/core";
import { getRoutesApi } from "@real-router/core/api";

const out: Record<string, unknown> = {};

type AnyRoute = Record<string, unknown>;
type Arc = "createRouter" | "add" | "replace";

/** Регистрирует batch через выбранную арку. Возвращает роутер и события. */
function register(
  arc: Arc,
  batch: unknown[],
): { router: ReturnType<typeof createRouter>; events: unknown[] } {
  const events: unknown[] = [];

  if (arc === "createRouter") {
    const router = createRouter(batch as never);

    getRoutesApi(router).subscribeChanges((e) => events.push(e));

    return { router, events };
  }

  const router = createRouter([{ name: "seed", path: "/seed" }] as never);

  getRoutesApi(router).subscribeChanges((e) => events.push(e));

  if (arc === "add") {
    getRoutesApi(router).add(batch as never);
  } else {
    getRoutesApi(router).replace(batch as never);
  }

  return { router, events };
}

/** Наблюдаемое состояние после регистрации — всё, что дверь может изменить. */
function observe(
  router: ReturnType<typeof createRouter>,
): Record<string, unknown> {
  const api = getRoutesApi(router);
  const u = api.get("u") as AnyRoute | undefined;
  const kid = api.get("u.kid") as AnyRoute | undefined;

  return {
    hasU: api.has("u"),
    hasKid: api.has("u.kid"),
    uName: u?.name,
    uPath: u?.path,
    uMetaIsLeaf: u?.meta,
    uKeys: u ? Object.keys(u).sort() : null,
    kidName: kid?.name,
    kidPath: kid?.path,
    buildU: router.buildPath("u", { id: "7" }),
    buildKid: router.buildPath("u.kid", { id: "7" }),
  };
}

const LEAF = { serviceLike: true };

/** Свежий batch: массив-контейнер, объект маршрута, вложенный children-массив. */
function makeBatch(): unknown[] {
  return [
    {
      name: "u",
      path: "/u/:id",
      meta: LEAF,
      defaultParams: { id: "1" },
      children: [{ name: "kid", path: "/kid" }],
    },
  ];
}

/** Мелкая копия КАЖДОГО уровня-контейнера; листья — те же ссылки. */
function shallowCopyBatch(batch: unknown[]): unknown[] {
  return batch.map((route) => {
    const copy = { ...(route as AnyRoute) };

    if (Array.isArray(copy.children)) {
      copy.children = (copy.children as AnyRoute[]).map((c) => ({ ...c }));
    }

    return copy;
  });
}

function main(): void {
  // ═══ S0 + S1. ЭКСПЕРИМЕНТ (а): оригинал против предварительно скопированного ═══
  for (const arc of ["createRouter", "add", "replace"] as const) {
    const orig = makeBatch();
    const copied = shallowCopyBatch(makeBatch());

    const a = register(arc, orig);
    const b = register(arc, copied);

    const oa = observe(a.router);
    const ob = observe(b.router);

    out[`${arc} · S0 positive control: route registered + printed`] =
      oa.hasU === true && oa.hasKid === true && oa.buildKid === "/u/7/kid";
    out[`${arc} · S1 observables identical (original vs pre-copied)`] =
      JSON.stringify({ ...oa, uMetaIsLeaf: undefined }) ===
      JSON.stringify({ ...ob, uMetaIsLeaf: undefined });
    out[`${arc} · S1 leaf identity survives BOTH arms (meta === LEAF)`] = {
      original: oa.uMetaIsLeaf === LEAF,
      preCopied: ob.uMetaIsLeaf === LEAF,
    };
    out[`${arc} · S1 events identical`] =
      JSON.stringify(a.events.map((e) => (e as AnyRoute).op)) ===
      JSON.stringify(b.events.map((e) => (e as AnyRoute).op));

    // ОБРАТНАЯ ВИДИМОСТЬ 1: мутируем оригинал ПОСЛЕ вызова.
    const route = orig[0] as AnyRoute;

    route.name = "hijacked";
    route.path = "/hijacked";
    route.lateKey = "late";
    (route.children as AnyRoute[])[0]!.name = "hijackedKid";
    (orig as AnyRoute[]).push({ name: "appended", path: "/appended" });

    const after = observe(a.router);

    out[
      `${arc} · S1 back-visibility: core sees late mutation of caller's containers`
    ] = {
      nameChanged: after.uName !== oa.uName,
      hasHijacked: getRoutesApi(a.router).has("hijacked"),
      hasAppended: getRoutesApi(a.router).has("appended"),
      lateKeyLeaked: (getRoutesApi(a.router).get("u") as AnyRoute | undefined)
        ?.lateKey,
      kidNameChanged: after.kidName !== oa.kidName,
    };

    // ОБРАТНАЯ ВИДИМОСТЬ 2: мутируем то, что ядро ОТДАЛО.
    const handout = getRoutesApi(a.router).get("u") as AnyRoute;
    let handoutWriteThrew = false;

    try {
      handout.name = "fromHandout";
      handout.injected = 1;
    } catch {
      handoutWriteThrew = true;
    }

    const handout2 = getRoutesApi(a.router).get("u") as AnyRoute;

    out[`${arc} · S1 handout round-trip`] = {
      handoutWriteThrew,
      sameHandoutIdentity: handout === handout2,
      coreKeptOwnName: handout2.name,
      originalUntouchedByHandoutWrite:
        (orig[0] as AnyRoute).injected === undefined,
    };

    a.router.dispose();
    b.router.dispose();
  }

  console.log(JSON.stringify(out, null, 1));
}

main();
