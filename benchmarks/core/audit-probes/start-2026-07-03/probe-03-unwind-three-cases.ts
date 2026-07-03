// probe-03: три кейса #unwindFailedStart (#763/#668) через публичные интерцепторы:
// (a) sync throw ДО next() — pre-commit STARTING → IDLE + TRANSITION_ERROR;
// (b) guard-blocked навигация — pre-commit READY → IDLE (probe-01b детализирует события);
// (c) async throw ПОСЛЕ next() (SSR-loader окно) — post-commit: state stands, isActive true.
import { createRouter, events } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

void (async () => {
  // (a) interceptor throws BEFORE next()
  {
    const r = createRouter([{ name: "a", path: "/a" }]);
    const api = getPluginApi(r);
    const log: string[] = [];

    for (const [key, name] of Object.entries(events)) {
      api.addEventListener(name as never, (() => log.push(key)) as never);
    }

    const removeInterceptor = api.addInterceptor("start", () => {
      throw new Error("boom-before-next");
    });

    const res = await r.start("/a").then(
      () => "RESOLVED",
      (e: Error) => `REJECTED ${e.message}`,
    );

    console.log(`(a) throw-before-next: ${res}; events: ${log.join(" → ")}`);
    console.log(`    isActive=${r.isActive()} state=${r.getState()?.name ?? "undefined"} (ожидаемо false/undefined)`);

    removeInterceptor(); // иначе retry снова бросит — артефакт пробы, не кода

    const retry = await r.start("/a").then(
      (s) => `RESOLVED ${s.name}`,
      (e: { code?: string }) => `REJECTED ${e.code}`,
    );

    console.log(`    recovery (interceptor снят): ${retry} (ожидаемо RESOLVED a)`);
  }

  // (c) async interceptor rejects AFTER next() committed (SSR/RSC loader window, #763)
  {
    const r = createRouter([{ name: "a", path: "/a" }]);
    const api = getPluginApi(r);
    const log: string[] = [];

    for (const [key, name] of Object.entries(events)) {
      api.addEventListener(name as never, (() => log.push(key)) as never);
    }

    api.addInterceptor("start", (async (next: (p: string) => Promise<unknown>, path: string) => {
      const state = await next(path); // коммит + TRANSITION_SUCCESS уже случились
      void state;
      throw new Error("loader-boom-after-commit");
    }) as never);

    const res = await r.start("/a").then(
      () => "RESOLVED",
      (e: Error) => `REJECTED ${e.message}`,
    );

    console.log(`(c) reject-after-commit: ${res}; events: ${log.join(" → ")}`);
    console.log(
      `    committed state stands: isActive=${r.isActive()} state=${r.getState()?.name} (ожидаемо true/a — «no phantom-success rollback», #763)`,
    );
  }
})();
