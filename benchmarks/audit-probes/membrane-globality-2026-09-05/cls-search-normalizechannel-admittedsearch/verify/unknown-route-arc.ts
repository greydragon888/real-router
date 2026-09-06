// ОПРОВЕРГАТЕЛЬ, дверь Router.buildPath·search.
// Классификатор объявил alreadyCopied = "yes" на ВСЕЙ двери и сам записал в
// unverified: ветка UNKNOWN_ROUTE у buildPathFromIntent отдаёт `search ??
// EMPTY_SEARCH` в port.buildPath БЕЗ normalizeChannel (params нормализуется,
// search — нет). Здесь ветка исполняется: доходит ли мешок вызывающего до
// ядра по ССЫЛКЕ и читается ли он там.
import { createRouter, UNKNOWN_ROUTE } from "@real-router/core";

const ROUTES = [{ name: "u", path: "/u/:id?tab" }] as never;

function tracingBag(seed: Record<string, unknown>) {
  const asked: string[] = [];
  const p = new Proxy(seed, {
    ownKeys: (t) => (asked.push("ownKeys"), Reflect.ownKeys(t)),
    get: (t, k) => (asked.push(`get:${String(k)}`), Reflect.get(t, k)),
    getOwnPropertyDescriptor: (t, k) => (
      asked.push(`gOPD:${String(k)}`),
      Reflect.getOwnPropertyDescriptor(t, k)
    ),
    has: (t, k) => (asked.push(`has:${String(k)}`), Reflect.has(t, k)),
  });
  return { p, asked };
}

const out: Record<string, unknown> = {};

for (const mode of ["default", "loose"]) {
  const r = createRouter(ROUTES, { queryParamsMode: mode } as never);
  r.start("/u/1");

  // ПОЗИТИВНЫЙ КОНТРОЛЬ: известный маршрут той же пробой — ветка canonicalize.
  const known = tracingBag({ tab: "x" });
  const knownHref = r.buildPath("u", { id: "7" } as never, known.p as never);

  // РЕШАЮЩИЙ ВХОД: UNKNOWN_ROUTE — ветка мимо canonicalize.
  const unk = tracingBag({ tab: "x" });
  let unkHref: unknown;
  try {
    unkHref = r.buildPath(
      UNKNOWN_ROUTE,
      { path: "/raw/url" } as never,
      unk.p as never,
    );
  } catch (e) {
    unkHref = `THROW ${(e as Error).message}`;
  }

  // ЛГУЩИЙ Proxy (P2) на той же ветке.
  const target: Record<string, unknown> = { tab: "LEAKED" };
  const lyingAsked: string[] = [];
  const lying = new Proxy(target, {
    ownKeys: () => (lyingAsked.push("ownKeys"), []),
    getOwnPropertyDescriptor: (t, k) => (
      lyingAsked.push(`gOPD:${String(k)}`),
      Reflect.getOwnPropertyDescriptor(t, k)
    ),
    get: (t, k) => (lyingAsked.push(`get:${String(k)}`), Reflect.get(t, k)),
    has: (t, k) => (lyingAsked.push(`has:${String(k)}`), Reflect.has(t, k)),
  });
  let lyingHref: unknown;
  try {
    lyingHref = r.buildPath(
      UNKNOWN_ROUTE,
      { path: "/raw/url" } as never,
      lying as never,
    );
  } catch (e) {
    lyingHref = `THROW ${(e as Error).message}`;
  }

  // P4 на той же ветке: заморозил ли кто-нибудь мешок/лист вызывающего.
  const leaf = ["a", "b"];
  const bag: Record<string, unknown> = { tab: leaf };
  let frozenHref: unknown;
  try {
    frozenHref = r.buildPath(
      UNKNOWN_ROUTE,
      { path: "/raw/url" } as never,
      bag as never,
    );
  } catch (e) {
    frozenHref = `THROW ${(e as Error).message}`;
  }

  out[mode] = {
    "control·knownRoute": { href: knownHref, asked: known.asked },
    "decisive·UNKNOWN_ROUTE": { href: unkHref, asked: unk.asked },
    "P2·lying·UNKNOWN_ROUTE": { href: lyingHref, asked: lyingAsked },
    "P4·UNKNOWN_ROUTE": {
      href: frozenHref,
      callerBagFrozenAfter: Object.isFrozen(bag),
      callerLeafFrozenAfter: Object.isFrozen(leaf),
    },
  };
}

console.log(JSON.stringify(out, null, 1));
