/**
 * ОПРОВЕРЖЕНИЕ вердикта COULD-(а) на семействе channel-defaults.
 *
 * Гипотеза классификатора: копия контейнера на границе меняет только
 * идентичность хэндаута и обратную видимость — «ничего не ломается».
 *
 * Здесь строится случай, где копия ЛОМАЕТ поведение, которое ядро сегодня
 * ПИНИТ ИСПОЛНЯЕМЫМИ тестами:
 *   packages/core/tests/functional/options.test.ts · "a defaultParams bag stays live after construction"
 *   packages/core/tests/functional/config-aliasing-authority-1958.test.ts · "a write one level down reaches both channels of the URL"
 *   packages/core/tests/functional/read-count-authority.test.ts · "every door reads it exactly once — the whole table" (#1847)
 *
 * Арма ORIGINAL — как сегодня (ядро держит ручку вызывающего).
 * Арма PRECOPIED — приложение отдаёт ядру `{...bag}`; ядро с тех пор держит
 * СВОЙ контейнер, т.е. ровно то, что даёт стратегия (а) на границе.
 * Позитивный контроль в каждой секции — легальный нетронутый мешок.
 */
import { createRouter } from "@real-router/core";
import { getPluginApi, getRoutesApi } from "@real-router/core/api";

const log = (k: string, v: unknown): void =>
  console.log(`${k} :: ${JSON.stringify(v)}`);

type Bag = Record<string, string>;
const copyIf = (bag: Bag, precopied: boolean): Bag =>
  precopied ? { ...bag } : bag;

// --- A. route defaultParams / defaultSearch: живая ручка ---
async function routeLive(precopied: boolean): Promise<unknown> {
  const dp: Bag = { id: "1" };
  const ds: Bag = { tab: "x" };
  const router = createRouter([
    {
      name: "u",
      path: "/u/:id?tab",
      defaultParams: copyIf(dp, precopied),
      defaultSearch: copyIf(ds, precopied),
    },
    { name: "home", path: "/home" },
  ] as never);

  await router.start("/home");

  const control = router.buildPath("u", {}); // позитивный контроль
  const handoutIsCallerBag = getRoutesApi(router).get("u")!.defaultParams === dp;

  dp.id = "LATE";
  ds.tab = "LATE";

  const afterMutation = router.buildPath("u", {});
  const committed = (await router.navigate("u", {})).path;

  router.dispose();

  return { control, handoutIsCallerBag, afterMutation, committed };
}

// --- B. #1847-инструмент: сколько раз ядро читает дефолт НА КАДР ---
async function readsPerFrame(precopied: boolean): Promise<unknown> {
  const reads: number[] = [];
  let counter = 0;
  const ds = {};

  Object.defineProperty(ds, "tab", {
    enumerable: true,
    configurable: true,
    get() {
      counter += 1;
      return "STABLE";
    },
  });

  const router = createRouter([
    {
      name: "u",
      path: "/u/:id?tab",
      defaultSearch: copyIf(ds as Bag, precopied),
    },
  ] as never);

  await router.start("/u/1");
  const boot = counter;

  counter = 0;
  const href = router.buildPath("u", { id: "7" });
  reads.push(counter);

  counter = 0;
  getPluginApi(router).makeState("u", { id: "7" }, {});
  reads.push(counter);

  counter = 0;
  const committed = (await router.navigate("u", { id: "7" })).path;
  reads.push(counter);

  router.dispose();

  return {
    readsBeforeFirstFrame: boot,
    perFrame: { buildPath: reads[0], makeState: reads[1], navigate: reads[2] },
    href,
    committed,
  };
}

// --- C. options.defaultParams: сценарий шиппед-теста options.test.ts ---
async function optionsLive(precopied: boolean): Promise<unknown> {
  const bag: Bag = { id: "1" };
  const router = createRouter(
    [
      { name: "u", path: "/u/:id" },
      { name: "home", path: "/home" },
    ],
    {
      defaultRoute: "u",
      defaultParams: copyIf(bag, precopied) as never,
      logger: { callback: () => undefined },
    },
  );

  await router.start("/home");

  const first = (await router.navigateToDefault()).path; // позитивный контроль
  const handedBack =
    (getPluginApi(router).getOptions() as unknown as { defaultParams: Bag })
      .defaultParams === bag;

  await router.navigate("home");
  bag.id = "999";

  const second = (await router.navigateToDefault()).path;

  router.stop();

  return { first, handedBack, second };
}

const main = async (): Promise<void> => {
  for (const precopied of [false, true]) {
    const arm = precopied ? "PRECOPIED (a)" : "ORIGINAL (b)";
    log(`A · route defaults · ${arm}`, await routeLive(precopied));
    log(`B · reads per frame · ${arm}`, await readsPerFrame(precopied));
    log(`C · options defaults · ${arm}`, await optionsLive(precopied));
  }
};

void main();
