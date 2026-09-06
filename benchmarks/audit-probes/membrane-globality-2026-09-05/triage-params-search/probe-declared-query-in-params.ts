// Второй срез того же батча: сколько раз читается ОБЪЯВЛЕННЫЙ query-ключ,
// положенный в PATH-мешок. Именно на нём живёт гейт P1
// (throwOnMisChanneledKey / findMisChanneledKey), читающий объект вызывающего
// ДО копии — то, что отличает alreadyCopied=partial от yes.
//
// Позитивный контроль в каждой ячейке: тот же код на ЛЕГАЛЬНОМ мешке
// (ключ в своём канале) — ниже, поле `control`; и счётчик > 0 доказывает,
// что вход дошёл до ветки.
import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

import { countingBag } from "../../../../packages/core/tests/helpers/hostileBags";

const out: Record<string, unknown> = {};

const routes = [
  { name: "u", path: "/u/:id?tab" },
  { name: "plain", path: "/plain/:id" },
] as never;

const mk = () => createRouter(routes, {} as never);

const call = async (
  label: string,
  run: (bag: Record<string, unknown>) => unknown,
) => {
  const p = countingBag({ id: "7", tab: "x" });
  let verdict: unknown;

  try {
    verdict = await run(p.bag as Record<string, unknown>);
  } catch (error) {
    verdict = `THROW: ${(error as Error).message.slice(0, 60)}`;
  }

  out[label] = { verdict, reads: p.reads };
};

async function main(): Promise<void> {
  {
    const r = mk();
    r.start("/plain/1");
    await call("navigate·routeParams (tab в params)", (bag) =>
      r.navigate("u", bag as never).then(
        (s) => s.name,
        (e: unknown) => `REJECT: ${String(e)}`,
      ),
    );
  }
  {
    const r = mk();
    r.start("/plain/1");
    await call("canNavigateTo·params (tab в params)", (bag) =>
      r.canNavigateTo("u", bag as never),
    );
  }
  {
    const r = mk();
    await call("buildPath·params (tab в params)", (bag) =>
      r.buildPath("u", bag as never),
    );
  }
  {
    const r = mk();
    r.start("/u/7?tab=x");
    await call("isActiveRoute·params (tab в params)", (bag) =>
      r.isActiveRoute("u", bag as never),
    );
  }
  {
    const r = mk();
    const api = getPluginApi(r);
    await call("PluginApi.makeState·params (tab в params)", (bag) =>
      api.makeState("u", bag as never),
    );
  }
  {
    const r = mk();
    const api = getPluginApi(r);
    await call("PluginApi.buildNavigationState·params (tab в params)", (bag) =>
      api.buildNavigationState("u", bag as never),
    );
  }

  // Позитивный контроль: тот же вызов, ключ в СВОЁМ канале — 1 чтение на ключ.
  {
    const r = mk();
    r.start("/plain/1");
    const p = countingBag({ id: "7" });
    const s = countingBag({ tab: "x" });
    const st = await r.navigate("u", p.bag as never, s.bag as never);
    out["control·navigate легальный мешок"] = {
      verdict: st.path,
      paramReads: p.reads,
      searchReads: s.reads,
    };
  }

  console.log(JSON.stringify(out, null, 1));
}

void main();
