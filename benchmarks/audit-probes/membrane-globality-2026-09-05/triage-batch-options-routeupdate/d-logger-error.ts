// ⚠ ФОРМА ИЗ ИСХОДНИКА: cloneRouter(router, dependencies?, opts?) — logger
// живёт в ТРЕТЬЕМ аргументе. Уточнение к секции D/E триаж-батча: гейт неизвестного ключа logger на
// cloneRouter vs createRouter, и правильная форма RouterError(code, options).
import { createRouter, RouterError } from "@real-router/core";
import { cloneRouter } from "@real-router/core/api";

const out: Record<string, unknown> = {};
const leafCb = (): void => {};
const router = createRouter([{ name: "u", path: "/u" }] as never);

try {
  const c = cloneRouter(router, undefined, { logger: { bogus: 1 } as never });
  out["clone with bogus logger key: ACCEPTED"] = true;
  out["clone !== base"] = c !== router;
  c.dispose();
} catch (e) {
  out["clone REJECTED"] = (e as Error).message;
}

// позитивный контроль инструмента: тот же ключ прямо в createRouter
try {
  createRouter(
    [{ name: "u", path: "/u" }] as never,
    { logger: { bogus: 1 } } as never,
  ).dispose();
  out["createRouter bogus ACCEPTED"] = true;
} catch (e) {
  out["createRouter bogus REJECTED"] = (e as Error).message;
}

// E — правильная форма: new RouterError(code, optionsBag)
const leaf = { deep: 1 };
const bag: Record<string, unknown> = { message: "boom", extra: leaf };
const err = new RouterError("X", bag) as unknown as Record<string, unknown>;
out["E · err.extra === leaf (лист по ссылке)"] = err.extra === leaf;
out["E · err !== bag"] = (err as unknown) !== (bag as unknown);
bag.late = 1;
out["E · late key invisible (контейнер скопирован)"] = !("late" in err);
out["E · instanceof intact"] = err instanceof RouterError;

// позитивный контроль: легальный override принимается и лист-callback по ссылке
try {
  const ok = cloneRouter(router, undefined, {
    logger: { level: "warn-error", callback: leafCb },
  });
  out["clone with LEGAL logger override: accepted"] = ok !== router;
  ok.dispose();
} catch (e) {
  out["legal override REJECTED (не должно)"] = (e as Error).message;
}

router.dispose();
console.log(JSON.stringify(out, null, 1));
