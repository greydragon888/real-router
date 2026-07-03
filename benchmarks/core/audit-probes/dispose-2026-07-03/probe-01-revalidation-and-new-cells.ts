// probe-01: dispose — ревалидация baseline-2026-06-25 против v0.63.0
// (дельта: cancel-унификация #1030-#1034, guards #982/#946) + новые клетки:
// N1 dispose() из subscribeChanges-handler'а (не-CRUD мутация дерева mid-dispatch —
// обходит REENTRANT_TREE_MUTATION), N2 dispose() из onTransitionCancel-слушателя
// (вложенный ПОЛНЫЙ dispose-цикл: FSM в момент CANCEL-emit ещё READY, не DISPOSED).
// Смежные filed-грани НЕ переоткрываются: #1169 (dispose из TRANSITION_START),
// #1186 (dispose в STARTING-окне), #1164 (event-emitter clearAll guard).
// Structural — валидно на батарее.
import { createRouter, events } from "@real-router/core";
import { getPluginApi, getRoutesApi } from "@real-router/core/api";

const ROUTES = [
  { name: "a", path: "/a" },
  { name: "b", path: "/b" },
];

function gate(): { promise: Promise<boolean>; release: () => void } {
  let release!: () => void;
  const promise = new Promise<boolean>((res) => {
    release = () => res(true);
  });

  return { promise, release };
}

void (async () => {
  // R1: dispose mid-TRANSITION_STARTED (async deactivate-guard) — ровно 1 CANCEL, 0 ERROR
  {
    const g = gate();
    const r = createRouter([
      { name: "a", path: "/a", canDeactivate: () => () => g.promise },
      { name: "b", path: "/b" },
    ]);

    await r.start("/a");

    let cancels = 0;
    let errors = 0;

    r.usePlugin(() => ({
      onTransitionCancel() {
        cancels++;
      },
      onTransitionError() {
        errors++;
      },
    }));

    const nav = r.navigate("b").catch((e: { code?: string }) => e.code);

    await new Promise((res) => setTimeout(res, 10)); // guard parked → TRANSITION_STARTED
    r.dispose();
    g.release();

    const navCode = await nav;

    console.log(
      `R1 dispose mid-TRANSITION_STARTED: cancels=${cancels} errors=${errors} nav=${String(navCode)} (baseline TG-1: ровно 1/0, CANCELLED)`,
    );
  }

  // R2: teardown-окно — navigate из teardown даёт cached NOT_STARTED (не ROUTER_DISPOSED)
  {
    const r = createRouter(ROUTES);

    await r.start("/a");

    let teardownNavCode = "?";

    r.usePlugin(() => ({
      teardown() {
        r.navigate("b").catch((e: { code?: string }) => {
          teardownNavCode = e.code ?? "?";
        });
      },
    }));

    r.dispose();
    await new Promise((res) => setTimeout(res, 5));
    console.log(`R2 navigate из teardown: code=${teardownNavCode} (baseline Q5: NOT_STARTED — асимметрия окна держится?)`);
  }

  // N1: dispose() из subscribeChanges-handler'а — не-CRUD мутация дерева mid-dispatch
  {
    const r = createRouter(ROUTES);
    const routes = getRoutesApi(r);

    await r.start("/a");

    const observed: string[] = [];
    let disposeThrew: string | null = null;
    let secondHandlerRan = false;
    let secondHandlerSeesAdded: boolean | null = null;

    routes.subscribeChanges((event) => {
      observed.push(`h1:${event.op}`);
      try {
        r.dispose(); // НЕ CRUD-оп → REENTRANT_TREE_MUTATION не применяется
      } catch (e) {
        disposeThrew = (e as { code?: string }).code ?? "threw";
      }
    });
    routes.subscribeChanges((event) => {
      secondHandlerRan = true;
      // causal check: событие говорит op:add, а дерево уже выпотрошено dispose'ом?
      secondHandlerSeesAdded = routes.has("c");
      observed.push(`h2:${event.op}:has(c)=${String(secondHandlerSeesAdded)}`);
    });

    try {
      routes.add({ name: "c", path: "/c" });
    } catch (e) {
      observed.push(`add-threw:${(e as { code?: string }).code}`);
    }

    console.log(
      `N1 dispose из subscribeChanges: dispose-threw=${disposeThrew ?? "no"}; h2-ran=${secondHandlerRan}; h2 видит add'нутый 'c'=${String(secondHandlerSeesAdded)}; seq=[${observed.join(" | ")}]`,
    );
    console.log(`   after: isActive=${r.isActive()}`);
  }

  // N2: dispose() из onTransitionCancel — вложенный ПОЛНЫЙ dispose-цикл
  {
    const g = gate();
    const r = createRouter([
      { name: "a", path: "/a", canDeactivate: () => () => g.promise },
      { name: "b", path: "/b" },
    ]);
    const api = getPluginApi(r);

    await r.start("/a");

    const log: string[] = [];
    let teardowns = 0;
    let innerDisposeThrew: string | null = null;

    for (const [key, name] of Object.entries(events)) {
      api.addEventListener(name as never, (() => log.push(key)) as never);
    }

    r.usePlugin(() => ({
      onTransitionCancel() {
        log.push("(reentrant dispose)");
        try {
          r.dispose(); // FSM здесь READY (CANCEL только что отработал) → полный вложенный цикл
        } catch (e) {
          innerDisposeThrew = (e as { code?: string }).code ?? "threw";
        }
      },
      teardown() {
        teardowns++;
      },
    }));

    const nav = r.navigate("b").catch((e: { code?: string }) => e.code);

    await new Promise((res) => setTimeout(res, 10));
    r.dispose(); // внешний
    g.release();
    await nav;

    console.log(
      `N2 dispose из onTransitionCancel: inner-threw=${innerDisposeThrew ?? "no"}; teardowns=${teardowns} (ожидаемо 1); isActive=${r.isActive()}`,
    );
    console.log(`   events: ${log.join(" → ")}`);

    let postCode = "";

    try {
      r.navigate("a");
    } catch (e) {
      postCode = (e as { code?: string }).code ?? "?";
    }
    console.log(`   post navigate: ${postCode} (ожидаемо DISPOSED)`);
  }
})();
