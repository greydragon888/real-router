// Третий срез: ДРЕЙФУЮЩИЙ мешок — единственный вход, который различает
// «спросить, потом взять» (P1) на объявленном query-ключе в PATH-мешке.
// Стабильный мешок ничего не доказывает: гейт бросает на первом же чтении.
//
// first = { id, tab: undefined } → гейт P1 видит undefined и ПРОПУСКАЕТ;
// then  = { tab: "x" }           → копия (normalizeChannel) берёт значение.
// Счётчик reads.tab > 1 = объект вызывающего прочитан выше копии И в копии
// (alreadyCopied = partial). Вердикт показывает, ловит ли это
// assertShippedChannelCorrect на УЖЕ СКОПИРОВАННОМ мешке (#1927).
//
// Позитивный контроль: тот же дрейфующий мешок на НЕобъявленном ключе
// (`zzz`) — гейт его не спрашивает, чтение ровно одно.
import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

import { driftingBag } from "../../../../packages/core/tests/helpers/hostileBags";

const out: Record<string, unknown> = {};

const routes = [
  { name: "u", path: "/u/:id?tab" },
  { name: "plain", path: "/plain/:id" },
] as never;

const mk = () => createRouter(routes, {} as never);

const run = async (
  label: string,
  first: Record<string, unknown>,
  then: Record<string, unknown>,
  call: (bag: Record<string, unknown>) => unknown,
) => {
  const p = driftingBag(first, then);
  let verdict: unknown;

  try {
    verdict = await call(p.bag as Record<string, unknown>);
  } catch (error) {
    verdict = `THROW: ${(error as Error).message.slice(0, 70)}`;
  }

  out[label] = { verdict, reads: p.reads };
};

async function main(): Promise<void> {
  const drifting = { id: "7", tab: undefined };
  const then = { tab: "x" };

  {
    const r = mk();
    r.start("/plain/1");
    await run("navigate·routeParams", drifting, then, (bag) =>
      r.navigate("u", bag as never).then(
        (s) => `OK ${s.path}`,
        (e: unknown) => `REJECT ${String(e)}`,
      ),
    );
  }
  {
    const r = mk();
    r.start("/plain/1");
    await run("canNavigateTo·params", drifting, then, (bag) =>
      r.canNavigateTo("u", bag as never),
    );
  }
  {
    const r = mk();
    await run("buildPath·params", drifting, then, (bag) =>
      r.buildPath("u", bag as never),
    );
  }
  {
    const r = mk();
    r.start("/u/7");
    await run("isActiveRoute·params", drifting, then, (bag) =>
      r.isActiveRoute("u", bag as never),
    );
  }
  {
    const api = getPluginApi(mk());
    await run("PluginApi.makeState·params", drifting, then, (bag) =>
      api.makeState("u", bag as never),
    );
  }
  {
    const api = getPluginApi(mk());
    await run("PluginApi.buildNavigationState·params", drifting, then, (bag) =>
      api.buildNavigationState("u", bag as never),
    );
  }

  // Контроль: НЕобъявленный ключ — гейт P1 его не спрашивает.
  {
    const r = mk();
    r.start("/plain/1");
    await run(
      "control·navigate необъявленный ключ zzz",
      { id: "7", zzz: "a" },
      { zzz: "b" },
      (bag) =>
        r.navigate("u", bag as never).then(
          (s) =>
            `OK ${s.path} params.zzz=${String((s.params as Record<string, unknown>).zzz)}`,
          (e: unknown) => `REJECT ${String(e)}`,
        ),
    );
  }

  console.log(JSON.stringify(out, null, 1));
}

void main();
