// probe-01: события при guard-blocked start() — wiki/start.md гарантирует
// «ROUTER_START is emitted only on success» (:122) и «On error: ROUTER_START
// is NOT emitted» (:69). Код two-phase (completeStart ПЕРЕД навигацией):
// какова фактическая хронология для (a) route-not-found и (b) guard-blocked?
import { createRouter, events } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

void (async () => {
  // (a) route not found при allowNotFound:false — completeStart не достигнут.
  // NB: DEFAULT allowNotFound оказался true (см. probe-04 b2) — здесь задаём явно.
  {
    const r = createRouter([{ name: "a", path: "/a" }], { allowNotFound: false });
    const api = getPluginApi(r);
    const log: string[] = [];

    for (const [key, name] of Object.entries(events)) {
      api.addEventListener(name as never, (() => log.push(key)) as never);
    }

    const res = await r.start("/nope").then(
      () => "RESOLVED",
      (e: { code?: string }) => `REJECTED ${e.code}`,
    );

    console.log(`(a) not-found (allowNotFound:false): ${res}; events: ${log.join(" → ") || "(none)"}`);
    console.log(`    ROUTER_START emitted: ${log.includes("ROUTER_START")} (wiki: false ожидаемо)`);
  }

  // (a2) SUCCESS-путь — полный порядок событий (wiki:100 не упоминает LEAVE_APPROVE)
  {
    const r = createRouter([{ name: "a", path: "/a" }]);
    const api = getPluginApi(r);
    const log: string[] = [];

    for (const [key, name] of Object.entries(events)) {
      api.addEventListener(name as never, (() => log.push(key)) as never);
    }

    await r.start("/a");
    console.log(`(a2) success events: ${log.join(" → ")} (wiki:100: ROUTER_START → TRANSITION_START → TRANSITION_SUCCESS)`);
  }

  // (b) guard-blocked start — completeStart УЖЕ выполнен к моменту блока
  {
    const r = createRouter([
      { name: "a", path: "/a", canActivate: () => () => false },
    ]);
    const api = getPluginApi(r);
    const log: string[] = [];
    const pluginLog: string[] = [];

    for (const [key, name] of Object.entries(events)) {
      api.addEventListener(name as never, (() => log.push(key)) as never);
    }

    r.usePlugin(() => ({
      onStart() {
        pluginLog.push("onStart");
      },
      onStop() {
        pluginLog.push("onStop");
      },
      onTransitionError() {
        pluginLog.push("onTransitionError");
      },
    }));

    const res = await r.start("/a").then(
      () => "RESOLVED",
      (e: { code?: string }) => `REJECTED ${e.code}`,
    );

    console.log(`(b) guard-blocked: ${res}; events: ${log.join(" → ")}`);
    console.log(`    plugin hooks: ${pluginLog.join(" → ")}`);
    console.log(
      `    ROUTER_START emitted on FAILED start: ${log.includes("ROUTER_START")} — wiki:122 говорит "only on success"`,
    );
    console.log(`    after: isActive=${r.isActive()} state=${r.getState()?.name ?? "undefined"}`);
  }
})();
