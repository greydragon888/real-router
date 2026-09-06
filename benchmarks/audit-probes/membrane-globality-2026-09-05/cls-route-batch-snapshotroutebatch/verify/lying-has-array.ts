// Эксплуатация найденного `has:0`: Array.prototype.map спрашивает
// HasProperty(O, "0") ПЕРЕД Get. Лгущий Proxy отвечает has=false, а get отдаёт
// легальный маршрут: гвард (for…of → iterator → get) элемент ВИДИТ и одобряет,
// снапшот (map) элемент ПРОПУСКАЕТ (дырка). Форма #1854 на массивной двери.
import { createRouter } from "@real-router/core";
import { getRoutesApi } from "@real-router/core/api";

const out: Record<string, unknown> = {};

function lyingHas(arr: unknown[]): unknown[] {
  return new Proxy(arr, {
    has(t, k): boolean {
      // лжём ТОЛЬКО про индексы, length/символы отдаём честно
      if (typeof k === "string" && /^\d+$/.test(k)) {
        return false;
      }

      return Reflect.has(t, k);
    },
  }) as unknown[];
}

function report(label: string, make: () => ReturnType<typeof createRouter>): void {
  try {
    const router = make();
    const api = getRoutesApi(router);

    out[label] = {
      threw: null,
      hasU: api.has("u"),
      registered: (api.get() as unknown[] | undefined)?.length ?? null,
    };
    router.dispose();
  } catch (error) {
    out[label] = { threw: String(error).slice(0, 160) };
  }
}

// ── лгущий has на батче ───────────────────────────────────────────────────────
report("createRouter · lying has(0) on batch", () =>
  createRouter(lyingHas([{ name: "u", path: "/u" }]) as never),
);

// ── позитивный контроль: тот же массив БЕЗ лжи ────────────────────────────────
report("createRouter · positive control: honest array", () =>
  createRouter([{ name: "u", path: "/u" }] as never),
);

// ── тот же приём на children ──────────────────────────────────────────────────
report("createRouter · lying has(0) on children", () =>
  createRouter([
    { name: "u", path: "/u", children: lyingHas([{ name: "kid", path: "/kid" }]) },
  ] as never),
);

// ── арки add / replace ────────────────────────────────────────────────────────
report("add · lying has(0) on batch", () => {
  const router = createRouter([{ name: "seed", path: "/seed" }] as never);

  getRoutesApi(router).add(lyingHas([{ name: "u", path: "/u" }]) as never);

  return router;
});
report("replace · lying has(0) on batch", () => {
  const router = createRouter([{ name: "seed", path: "/seed" }] as never);

  getRoutesApi(router).replace(lyingHas([{ name: "u", path: "/u" }]) as never);

  return router;
});

// ── доказательство, что ложь дошла до map, а не была съедена раньше ───────────
{
  const raw = [{ name: "u", path: "/u" }];
  const p = lyingHas(raw);

  out["control: map over the lying proxy drops the element"] = {
    mapped: JSON.stringify(p.map((r) => r)),
    holeAtZero: !(0 in p.map((r) => r)),
    getStillWorks: JSON.stringify(p[0]),
    iteratorStillYields: JSON.stringify([...p]),
  };
}

console.log(JSON.stringify(out, null, 1));
