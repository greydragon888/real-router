/**
 * ОПРОВЕРГАТЕЛЬ, линза 1 (семантика) для двери createRouter·options.limits.
 * Клейм классификатора: «сырой мешок ... ядром больше не читается»,
 * «единственное различие арм — идентичность ХЭНДАУТА getOptions().limits,
 *  а он ядром не перечитывается».
 * Здесь: живой ПЕРВОСТОРОННИЙ потребитель — @real-router/validation-plugin —
 * читает ctx.getOptions().limits?.maxLifecycleHandlers на КАЖДОЙ регистрации
 * обработчика (RouteLifecycleNamespace · #registerHandler → validator.lifecycle
 * .validateHandlerLimit) и БРОСАЕТ по нему. Значит round-trip есть, и предкопия
 * контейнера на границе МЕНЯЕТ наблюдаемое поведение.
 * Форма API прочитана из исходника: getLifecycleApi → addActivateGuard(name, h).
 */
import { createRouter } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";
import { validationPlugin } from "@real-router/validation-plugin";

const R = Array.from({ length: 8 }, (_, i) => ({
  name: `u${i}`,
  path: `/u${i}/:id`,
})) as never;
const say = (k: string, v: unknown): void =>
  console.log(`${k}: ${JSON.stringify(v)}`);

function run(preCopy: boolean, mutateAfter: boolean): string {
  const callerLimits: Record<string, number> = { maxLifecycleHandlers: 2 };
  const r = createRouter(R, {
    limits: preCopy ? { ...callerLimits } : callerLimits,
  } as never);
  r.usePlugin(validationPlugin() as never);
  if (mutateAfter) callerLimits.maxLifecycleHandlers = 99;
  const life = getLifecycleApi(r as never);
  let n = 0;
  try {
    for (let i = 0; i < 6; i++) {
      life.addActivateGuard(`u${i}`, () => () => true);
      n++;
    }
  } catch (e) {
    return `принято ${n}, затем бросок: ${(e as Error).message.slice(0, 90)}`;
  }
  return `принято ${n}, броска нет`;
}

console.log("\n===== ПОЗИТИВНЫЙ КОНТРОЛЬ =====");
say(
  "PC · без мутации, без предкопии (лимит 2 обязан сработать)",
  run(false, false),
);
say("PC · без мутации, с предкопией (тот же лимит 2)", run(true, false));

console.log("\n===== ЭКСПЕРИМЕНТ (а): предкопия против оригинала =====");
say("ОРИГИНАЛ (ручка) + мутация мешка ПОСЛЕ createRouter", run(false, true));
say("ПРЕДКОПИЯ + мутация мешка ПОСЛЕ createRouter", run(true, true));

console.log("\n===== то же ДРЕЙФУЮЩИМ геттером (без мутации извне) =====");
{
  let k = 0;
  const drifting = {
    get maxLifecycleHandlers(): number {
      k++;
      return k <= 3 ? 2 : 99;
    },
  };
  const r = createRouter(R, { limits: drifting } as never);
  r.usePlugin(validationPlugin() as never);
  const life = getLifecycleApi(r as never);
  let n = 0;
  let msg = "броска нет";
  try {
    for (let i = 0; i < 6; i++) {
      life.addActivateGuard(`u${i}`, () => () => true);
      n++;
    }
  } catch (e) {
    msg = (e as Error).message.slice(0, 90);
  }
  say("дрейфующий геттер: принято", n);
  say("дрейфующий геттер: исход", msg);
  say("геттер вызван раз ВСЕГО (2 = только boot)", k);
}
