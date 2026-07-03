// probe-04: (a) sync navigate() из onStart-хука плагина — банится ли
// (REENTRANT_NAVIGATION) и кто выигрывает (start-навигация или onStart-навигация);
// (b) wiki:104 «defaultRoute: used when path is empty» vs wiki:98/:116
// «"" → "/" без defaultRoute-фолбэка» — что делает код при start("") с defaultRoute.
import { createRouter } from "@real-router/core";

void (async () => {
  // (a) onStart → sync navigate()
  {
    const r = createRouter([
      { name: "a", path: "/a" },
      { name: "b", path: "/b" },
    ]);
    let onStartNavResult = "(not called)";

    r.usePlugin(() => ({
      onStart() {
        try {
          // sync fire-and-forget navigate из onStart (ROUTER_START dispatch)
          r.navigate("b");
          onStartNavResult = "accepted (no throw)";
        } catch (e) {
          onStartNavResult = `THREW ${(e as { code?: string }).code}`;
        }
      },
    }));

    const res = await r.start("/a").then(
      (s) => `RESOLVED ${s.name}`,
      (e: { code?: string }) => `REJECTED ${e.code}`,
    );

    console.log(`(a) onStart→navigate('b'): ${onStartNavResult}`);
    console.log(`    start('/a') → ${res}; final state=${r.getState()?.name} (кто выиграл?)`);
  }

  // (b) start("") при заданном defaultRoute
  {
    const r = createRouter(
      [
        { name: "home", path: "/" },
        { name: "dash", path: "/dash" },
      ],
      { defaultRoute: "dash" },
    );

    const res = await r.start("").then(
      (s) => `RESOLVED ${s.name}`,
      (e: { code?: string }) => `REJECTED ${e.code}`,
    );

    console.log(`(b1) start("") + defaultRoute:"dash" + root route → ${res} (wiki:98 ожидает home, wiki:104 намекает dash)`);
  }

  {
    const r = createRouter(
      [{ name: "dash", path: "/dash" }], // корневого маршрута НЕТ
      { defaultRoute: "dash" },
    );

    const res = await r.start("").then(
      (s) => `RESOLVED ${s.name}`,
      (e: { code?: string }) => `REJECTED ${e.code}`,
    );

    console.log(`(b2) start("") + defaultRoute:"dash", корневого маршрута нет → ${res} (wiki:98: ROUTE_NOT_FOUND, wiki:104: dash?)`);
  }
})();
