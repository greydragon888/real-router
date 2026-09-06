// Сиблинги того же батча, не покрытые probe.ts:
// port().defaultSearch·return, port().resolveForward·return.
// Каждая ячейка: позитивный контроль + доказательство, что вход дошёл до ветки.
import { createRouter } from "@real-router/core";
import { getInternals } from "@real-router/core/validation";

type AnyRec = Record<string, unknown>;
const out: AnyRec = {};

const ds = { tab: "def-tab" };
const dp = { id: "d-default" };

function build() {
  const router = createRouter(
    [
      { name: "home", path: "/home" },
      { name: "d", path: "/d/:id?tab", defaultParams: dp, defaultSearch: ds },
      { name: "src", path: "/src", forwardTo: "home" },
      { name: "plain", path: "/plain/:id?q" },
    ] as never,
    { defaultRoute: "home" } as never,
  );
  return { router, ctx: getInternals(router) };
}

async function main(): Promise<void> {
  // --- A. port().defaultSearch·return
  {
    const { router, ctx } = build();
    await router.start("/home");
    const port = ctx.port();
    const handout = port.defaultSearch("d");
    const before = (await router.navigate("d", { id: "1" } as never)).search;
    (handout as AnyRec).tab = "MUTATED";
    const after = (await router.navigate("d", { id: "2" } as never)).search;
    out["A.port.defaultSearch"] = {
      control_reached: handout,
      control_missingRoute: port.defaultSearch("home"),
      isCallersOwnBag: handout === (ds as unknown),
      frozen: Object.isFrozen(handout),
      sameAcrossCalls: handout === port.defaultSearch("d"),
      before,
      afterCallerMutation: after,
      coreReadsBack: (after as AnyRec).tab === "MUTATED",
    };
    (ds as AnyRec).tab = "def-tab";
  }

  // --- B. port().resolveForward·return — нефорвардящий и форвардящий маршруты
  {
    const { router, ctx } = build();
    await router.start("/home");
    const port = ctx.port();
    const p = { id: "7" };
    const s = { q: "x" };
    const r1 = port.resolveForward("plain", p as never, s as never);
    const r2 = port.resolveForward("plain", p as never, s as never);
    const f1 = port.resolveForward("src", {} as never, {} as never);
    out["B.port.resolveForward"] = {
      control_reached_nonForward: r1,
      control_reached_forward: f1,
      shellFreshPerCall: r1 !== r2,
      shellFrozen: Object.isFrozen(r1),
      paramsIsCallersBag: (r1 as AnyRec).params === (p as unknown),
      searchIsCallersBag: (r1 as AnyRec).search === (s as unknown),
      forwardParamsFresh: (f1 as AnyRec).params !== (p as unknown),
      forwardShellFrozen: Object.isFrozen(f1),
      shellMutateVerdict: (() => {
        try {
          (r1 as AnyRec).name = "HACKED";
          return "no-throw";
        } catch (e) {
          return `throw:${(e as Error).constructor.name}`;
        }
      })(),
    };
    const afterShellMutation = await router.navigate(
      "plain",
      p as never,
      s as never,
    );
    out["B.port.resolveForward"] = {
      ...(out["B.port.resolveForward"] as AnyRec),
      navigateNameAfterShellMutation: afterShellMutation.name,
      navigatePathAfterShellMutation: afterShellMutation.path,
    };
  }

  console.log(JSON.stringify(out, null, 2));
}

void main();
