// probe-05: stop()/dispose() в ЧИСТОМ окне STARTING — async-интерцептор,
// делающий await ДО next() (легитимный паттерн «дождись конфига, потом стартуй»).
// wiki/start.md:115: «stop() during start: Cancels transition with TRANSITION_CANCELLED».
// FSM-таблица: STARTING не принимает ни STOP, ни CANCEL — что происходит фактически?
import { createRouter, events } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

function makeGate(): { promise: Promise<void>; release: () => void } {
  let release!: () => void;
  const promise = new Promise<void>((res) => {
    release = res;
  });

  return { promise, release };
}

void (async () => {
  // (a) stop() в окне STARTING (интерцептор ещё не вызвал next)
  {
    const r = createRouter([{ name: "a", path: "/a" }]);
    const api = getPluginApi(r);
    const gate = makeGate();

    api.addInterceptor("start", (async (next: (p: string) => Promise<unknown>, path: string) => {
      await gate.promise; // окно STARTING
      return next(path);
    }) as never);

    const startP = r.start("/a");

    await new Promise((res) => setTimeout(res, 10));
    console.log(`(a) во время окна: isActive=${r.isActive()} (FSM STARTING)`);
    r.stop(); // wiki:115: «Cancels transition with TRANSITION_CANCELLED»
    console.log(`    сразу после stop(): isActive=${r.isActive()} (wiki ожидает false + CANCELLED)`);
    gate.release();

    const res = await startP.then(
      (s: { name: string }) => `RESOLVED ${s.name}`,
      (e: { code?: string }) => `REJECTED ${e.code}`,
    );

    console.log(`    start settled: ${res}; final isActive=${r.isActive()} state=${r.getState()?.name ?? "undefined"}`);
  }

  // (b) dispose() в окне STARTING — DISPOSE из STARTING разрешён (#660);
  // что происходит, когда интерцептор потом продолжает next()?
  {
    const r = createRouter([{ name: "a", path: "/a" }]); // allowNotFound default TRUE
    const api = getPluginApi(r);
    const gate = makeGate();
    const log: string[] = [];

    for (const [key, name] of Object.entries(events)) {
      api.addEventListener(name as never, (() => log.push(key)) as never);
    }

    api.addInterceptor("start", (async (next: (p: string) => Promise<unknown>, path: string) => {
      await gate.promise;
      return next(path);
    }) as never);

    const startP = r.start("/a");

    await new Promise((res) => setTimeout(res, 10));
    r.dispose();
    console.log(`(b) после dispose() в окне: isActive=${r.isActive()} isDisposed(getState throws?)…`);
    gate.release();

    const res = await startP.then(
      (s: { name: string }) => `RESOLVED ${s.name}`,
      (e: { code?: string }) => `REJECTED ${e.code ?? (e as Error).message}`,
    );

    let state: string;

    try {
      state = r.getState()?.name ?? "undefined";
    } catch (e) {
      state = `THROW ${(e as { code?: string }).code}`;
    }

    console.log(`    start settled: ${res}`);
    console.log(`    после всего: isActive=${r.isActive()} state=${state} events=${log.join(" → ")}`);
    console.log(`    state на disposed-роутере установлен: ${state !== "undefined" && !state.startsWith("THROW")}`);
  }

  // (c) КОНТРАСТ к (b): dispose() в окне, но путь МАТЧИТСЯ после dispose?
  // Нет — routes очищены dispose'ом, поэтому для контраста фиксируем matched-ветку
  // через allowNotFound:false: matchPath→undefined → throw ROUTE_NOT_FOUND (reject,
  // не тихий resolve). Плюс подтверждаем: navigateToState-ветка защищена FSM-гейтом
  // canNavigate (NOT_STARTED), navigateToNotFound-ветка — нет.
  {
    const r = createRouter([{ name: "a", path: "/a" }], { allowNotFound: false });
    const api = getPluginApi(r);
    const gate = makeGate();

    api.addInterceptor("start", (async (next: (p: string) => Promise<unknown>, path: string) => {
      await gate.promise;
      return next(path);
    }) as never);

    const startP = r.start("/a");

    await new Promise((res) => setTimeout(res, 10));
    r.dispose();
    gate.release();

    const res = await startP.then(
      (s: { name: string }) => `RESOLVED ${s.name}`,
      (e: { code?: string }) => `REJECTED ${e.code ?? (e as Error).message}`,
    );

    console.log(`(c) allowNotFound:false + dispose в окне: start settled: ${res}`);
    console.log(`    (reject вместо (b)-шного тихого resolve — асимметрия веток notFound/strict)`);
  }
})();
