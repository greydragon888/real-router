// probe-01: (I) ревалидация шести RESOLVED-вопросов baseline-2026-06-25 против
// v0.63.0 (дельта: #964-#969 clone, #1030-#1034 reentrancy, prettier reformat);
// (II) охота на непокрытое: N1 write-after-dispose, N3 __proto__-namespace
// (silent data loss через подмену прототипа context), N4 невалидные имена
// (пустая строка / не-строка — нет typeof-гарда, в отличие от 3 других
// invariant-гардов). Structural — валидно на батарее.
import { createRouter } from "@real-router/core";
import { cloneRouter, getPluginApi } from "@real-router/core/api";
import { serializeRouterState } from "@real-router/core/utils";

const ROUTES = [
  { name: "home", path: "/" },
  { name: "other", path: "/other" },
];

void (async () => {
  // ===== I. Ревалидация Q1-Q6 =====
  {
    const r = createRouter(ROUTES);
    const api = getPluginApi(r);

    await r.start("/");

    // Q1 frozen-state / context exempt
    const claim = api.claimContextNamespace("q1");
    const st = r.getState()!;

    claim.write(st, { ok: 1 });
    console.log(
      `Q1 state.frozen=${Object.isFrozen(st)} context.frozen=${Object.isFrozen(st.context)} write-ok=${JSON.stringify(st.context.q1) === '{"ok":1}'}`,
    );

    // Q3 write-after-release
    claim.release();
    claim.write(st, { after: true });
    console.log(`Q3 write-after-release still works=${(st.context.q1 as { after?: boolean }).after === true}`);

    // Q4 reclaim-stale-read + per-nav context rebuild
    const claimB = api.claimContextNamespace("q1");
    const stale = st.context.q1 !== undefined;

    await r.navigate("other");
    console.log(`Q4 reclaim sees stale on SAME state=${stale}; after navigate context.q1=${String(r.getState()!.context.q1)}`);
    claimB.release();

    // Q5 unsubscribe не авто-релизит
    let inner: { release(): void } | undefined;
    const unsub = r.usePlugin((rr) => {
      inner = getPluginApi(rr).claimContextNamespace("q5");

      return { teardown() {} };
    });

    unsub();
    let q5Threw = false;

    try {
      api.claimContextNamespace("q5");
    } catch {
      q5Threw = true;
    }
    console.log(`Q5 re-claim after unsubscribe threw ALREADY_CLAIMED=${q5Threw} (by-design: manual release)`);
    inner?.release();
  }

  // Q2 cross-clone isolation (дельта #964-#969 трогала cloneRouter)
  {
    const base = createRouter(ROUTES);

    await base.start("/");
    getPluginApi(base).claimContextNamespace("q2");

    const clone = cloneRouter(base);
    let ok = false;

    try {
      getPluginApi(clone).claimContextNamespace("q2");
      ok = true;
    } catch {
      /* shared would throw */
    }
    console.log(`Q2 clone re-claim ok=${ok} (fresh Set per clone держится)`);
    clone.dispose();
    base.dispose();
  }

  // Q6 dispose: claim после dispose бросает DISPOSED
  {
    const r = createRouter(ROUTES);
    const api = getPluginApi(r);

    api.claimContextNamespace("q6");
    r.dispose();

    let code = "";

    try {
      api.claimContextNamespace("q6");
    } catch (e) {
      code = (e as { code?: string }).code ?? "?";
    }
    console.log(`Q6 post-dispose claim code=${code}`);
  }

  // ===== II. Новые клетки =====

  // N1: write-after-dispose — кэшированный claim пишет в удержанный state
  {
    const r = createRouter(ROUTES);
    const api = getPluginApi(r);

    await r.start("/");

    const claim = api.claimContextNamespace("n1");
    const heldState = r.getState()!; // потребитель удержал ссылку (адаптер/след. рендер)

    r.dispose();

    let threw = false;

    try {
      claim.write(heldState, { zombie: true });
    } catch {
      threw = true;
    }
    console.log(
      `N1 write-after-dispose: threw=${threw} mutated-held-state=${(heldState.context.n1 as { zombie?: boolean } | undefined)?.zombie === true} (гарда живости в write нет)`,
    );
  }

  // N3: __proto__-namespace — подмена прототипа context → silent data loss
  {
    const r = createRouter(ROUTES);
    const api = getPluginApi(r);

    await r.start("/");

    const claim = api.claimContextNamespace("__proto__"); // коллизия-гард пропускает
    const st = r.getState()!;
    const payload = { secret: "plugin-data" };

    claim.write(st, payload);

    const ownKeys = Object.keys(st.context);
    const protoSwapped = Object.getPrototypeOf(st.context) === payload;
    const serialized = serializeRouterState(st);
    const roundtrip = JSON.parse(serialized) as { context?: Record<string, unknown> };

    console.log(
      `N3 claim("__proto__")+write: own-keys=[${ownKeys.join(",")}] proto-swapped=${protoSwapped} Object.prototype-polluted=${({} as { secret?: string }).secret !== undefined}`,
    );
    // NB: НЕ `"__proto__" in roundtrip.context` — `in` видит унаследованный
    // Object.prototype-аксессор на ЛЮБОМ объекте и лжёт «есть». Только hasOwn.
    console.log(
      `N3 serializeRouterState context=${JSON.stringify(roundtrip.context)} → данные плагина в SSR-транспорте: ${roundtrip.context && Object.hasOwn(roundtrip.context, "__proto__") ? "есть" : "ПОТЕРЯНЫ"}`,
    );
  }

  // N4: имя-namespace без typeof/shape-гарда (пустая строка, число)
  {
    const r = createRouter(ROUTES);
    const api = getPluginApi(r);

    await r.start("/");

    let emptyOk = false;
    let numberOk = false;

    try {
      const c = api.claimContextNamespace("");

      c.write(r.getState()!, "empty-name-value");
      emptyOk = r.getState()!.context[""] === "empty-name-value";
    } catch {
      /* guard would throw */
    }

    try {
      const c = (api.claimContextNamespace as (ns: unknown) => { write(s: unknown, v: unknown): void })(42);

      c.write(r.getState()!, "num");
      numberOk = (r.getState()!.context as Record<string, unknown>)["42"] === "num";
    } catch {
      /* guard would throw */
    }
    console.log(
      `N4 claim("") accepted=${emptyOk}; claim(42) accepted=${numberOk} (typeof-гарда нет — ср. subscribe/navigateToNotFound/start guards)`,
    );
  }
})();
