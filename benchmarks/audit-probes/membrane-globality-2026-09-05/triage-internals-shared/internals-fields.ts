// Триаж: RouterInternals.interceptors / routerExtensions / contextClaimRecords.
// Вопрос: ядро ОТДАЁТ эти контейнеры наружу (getInternals из @real-router/core/validation)
// и ЧИТАЕТ ИХ ОБРАТНО после того, как плагин мог их изменить?  → roundtrip.
import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

const out: Record<string, unknown> = {};

// ---------- A. interceptors: массив ВЫЗЫВАЮЩЕГО, поставленный через .set ----------
{
  const router = createRouter(
    [{ name: "u", path: "/u/:id" }] as never,
    {} as never,
  );
  const api = getPluginApi(router as never);
  const ctx = getInternals(router as never);

  // ПОЗИТИВНЫЙ КОНТРОЛЬ: штатный addInterceptor виден ядром.
  let legalSeen = 0;
  api.addInterceptor("forwardState", ((next: never, ...a: never[]) => {
    legalSeen++;
    return (next as never as (...x: never[]) => never)(...a);
  }) as never);
  router.buildPath("u", { id: "1" });
  out.A_legalInterceptorRan = legalSeen;

  // ВРАЖДЕБНО: подменяем сам массив цепочки на массив вызывающего.
  const foreignChain: unknown[] = [];
  let foreignSeen = 0;
  foreignChain.push((next: (...x: never[]) => never, ...a: never[]) => {
    foreignSeen++;
    return next(...a);
  });
  ctx.interceptors.set("forwardState", foreignChain as never);
  const p = router.buildPath("u", { id: "2" });
  out.A_foreignChainExecuted = foreignSeen;
  out.A_legalInterceptorAfterSwap = legalSeen; // прежний массив больше не читается
  out.A_path = p;

  // ДРЕЙФ: массив вызывающего пополняется ПОСЛЕ установки — ядро читает его заново.
  let lateSeen = 0;
  foreignChain.push((next: (...x: never[]) => never, ...a: never[]) => {
    lateSeen++;
    return next(...a);
  });
  router.buildPath("u", { id: "3" });
  out.A_lateAddedInterceptorRan = lateSeen;
}

// ---------- B. routerExtensions: запись вызывающего читается на dispose ----------
{
  const router = createRouter(
    [{ name: "u", path: "/u/:id" }] as never,
    {} as never,
  );
  const api = getPluginApi(router as never);
  const ctx = getInternals(router as never);

  // ПОЗИТИВНЫЙ КОНТРОЛЬ: штатный extendRouter ставит ключ и dispose его снимает.
  api.extendRouter({ legalKey: 1 } as never);
  out.B_legalKeyInstalled = "legalKey" in (router as never as object);

  // ВРАЖДЕБНО: запись вызывающего с геттером на keys — ядро читает `extension.keys`.
  let keysRead = 0;
  (router as never as Record<string, unknown>).victim = "still-here";
  ctx.routerExtensions.push({
    get keys() {
      keysRead++;
      return ["victim"];
    },
  } as never);

  router.dispose();
  out.B_foreignRecordKeysRead = keysRead;
  out.B_victimDeletedByCore = !("victim" in (router as never as object));
  out.B_legalKeyDeleted = !("legalKey" in (router as never as object));
}

// ---------- C. contextClaimRecords: чужая запись блокирует, но не читается ----------
{
  const router = createRouter(
    [{ name: "u", path: "/u/:id" }] as never,
    {} as never,
  );
  const api = getPluginApi(router as never);
  const ctx = getInternals(router as never);

  // ПОЗИТИВНЫЙ КОНТРОЛЬ: свободное имя клеймится.
  const ok = api.claimContextNamespace("free");
  out.C_legalClaim = typeof ok.write === "function";

  let fieldReads = 0;
  const foreign = new Proxy({} as Record<string, unknown>, {
    get(t, k) {
      fieldReads++;
      return (t as never as Record<string | symbol, unknown>)[k];
    },
  });
  ctx.contextClaimRecords.set("squatted", foreign as never);

  let blocked = "no";
  try {
    api.claimContextNamespace("squatted");
  } catch (e) {
    blocked = (e as { code?: string }).code ?? (e as Error).name;
  }
  out.C_secondClaimBlocked = blocked;
  out.C_foreignRecordFieldReads = fieldReads;
}

console.log(JSON.stringify(out, null, 1));
