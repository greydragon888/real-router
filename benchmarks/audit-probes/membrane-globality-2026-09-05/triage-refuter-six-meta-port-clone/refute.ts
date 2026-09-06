// ОПРОВЕРГАТЕЛЬ: шесть строк, исключённых как handout.
// Приём: (1) на ОТДАННЫЙ объект вешаются счётные геттеры → ядро читает обратно?
// (2) отданный объект МУТИРУЕТСЯ → меняет ли это последующий вердикт ядра?
// В каждом блоке позитивный контроль.
import { createRouter } from "@real-router/core";
import { cloneRouter } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

type AnyRec = Record<string, unknown>;
const out: AnyRec = {};

function countReads<T extends object>(obj: T): { n: number; keys: string[] } {
  const box = { n: 0, keys: [] as string[] };
  for (const k of Object.keys(obj)) {
    const d = Object.getOwnPropertyDescriptor(obj, k);
    if (!d || !d.configurable || d.get) continue;
    const v = d.value;
    Object.defineProperty(obj, k, {
      configurable: true,
      enumerable: d.enumerable,
      get() {
        box.n++;
        box.keys.push(k);
        return v;
      },
      set() {},
    });
  }
  return box;
}

function tryWrite(o: AnyRec, key: string, val: unknown): string {
  try {
    o[key] = val;
    return o[key] === val ? "written" : "no-effect";
  } catch (e) {
    return `throw:${(e as Error).constructor.name}`;
  }
}

const routes = [
  {
    name: "u",
    path: "/u/:id?tab",
    children: [{ name: "c", path: "/c/:cid?q" }],
  },
  { name: "s", path: "/s" },
];
const router = createRouter(routes, { defaultRoute: "s" });
const ctx = getInternals(router);

// ─── БЛОК 1: meta-хэндауты (getMetaForState / matcher.getMetaByName) ───
const meta1 = ctx.getMetaForState("u.c") as AnyRec;
const meta2 = ctx.routeGetStore().matcher.getMetaByName("u.c") as AnyRec;
out.meta_identity = {
  sameObject: meta1 === meta2,
  outerFrozen: Object.isFrozen(meta1),
  innerFrozen: Object.isFrozen(meta1["u.c"] as object),
  control_keys: Object.keys(meta1),
};
out.meta_writes = {
  outerAssign: tryWrite(meta1, "injected", { z: "url" }),
  outerDefine: (() => {
    try {
      Object.defineProperty(meta1, "injected2", { value: 1 });
      return "defined";
    } catch (e) {
      return `throw:${(e as Error).constructor.name}`;
    }
  })(),
  outerDelete: (() => {
    try {
      return delete meta1["u.c"] ? "deleted" : "no-effect";
    } catch (e) {
      return `throw:${(e as Error).constructor.name}`;
    }
  })(),
  innerAssign: tryWrite(meta1["u.c"] as AnyRec, "q", "url"),
  keysAfterAllWrites: Object.keys(meta1),
  innerAfter: { ...(meta1["u.c"] as AnyRec) },
};
// круговой контроль: ядро действительно читает эту запись обратно (навигация)
router.start("/u/1/c/2?tab=a&q=b");
const st1 = router.getState()!;
const st2 = ctx.makeState("u.c", { id: "1", cid: "9" }, { q: "b" });
out.meta_roundtrip_control = {
  coreReadsRecord_shouldUpdateNode_uc: router.shouldUpdateNode("u.c")(st2, st1),
  coreReadsRecord_shouldUpdateNode_u: router.shouldUpdateNode("u")(st2, st1),
  recordStillSameObject: ctx.getMetaForState("u.c") === meta1,
};

// ─── БЛОК 2: port().resolveForward·return и buildStateResolved·return ───
const callerParams: AnyRec = { id: "7", cid: "8" };
const fwd = ctx.port().resolveForward("u.c", callerParams as never) as AnyRec;
const bsr = ctx.buildStateResolved("u.c", callerParams as never) as AnyRec;
out.shells = {
  fwd_paramsIsCallersBag: fwd.params === callerParams,
  bsr_paramsIsCallersBag: bsr.params === callerParams,
  fwd_freshPerCall:
    ctx.port().resolveForward("u.c", callerParams as never) !== fwd,
  bsr_freshPerCall: ctx.buildStateResolved("u.c", callerParams as never) !== bsr,
  bsr_metaIsHandoutRecord: bsr.meta === meta1,
};
const fwdReads = countReads(fwd);
const bsrReads = countReads(bsr);
// мутируем ДРУГИЕ отданные оболочки (счётный set() глотал бы запись) —
// если ядро их читает обратно, вердикт поедет
const fwdM = ctx.port().resolveForward("u.c", callerParams as never) as AnyRec;
const bsrM = ctx.buildStateResolved("u.c", callerParams as never) as AnyRec;
fwdM.name = "s";
bsrM.name = "s";
(bsrM as { meta: unknown }).meta = {};
out.shells_mutation_control = {
  fwdNameAfterWrite: fwdM.name,
  bsrNameAfterWrite: bsrM.name,
};
const afterNav = router.buildPath("u.c", { id: "3", cid: "4" }, { q: "z" });
const afterState = ctx.makeState("u.c", { id: "3", cid: "4" });
out.shells_roundtrip = {
  fwdReadsAfterHandout: fwdReads.n,
  fwdKeys: [...fwdReads.keys],
  bsrReadsAfterHandout: bsrReads.n,
  bsrKeys: [...bsrReads.keys],
  buildPathUnaffected: afterNav,
  makeStateNameUnaffected: afterState.name,
};
// позитивный контроль счётчиков: тот же countReads на мешке ВЫЗЫВАЮЩЕГО,
// поданном во ВХОДНУЮ дверь — ядро обязано его прочитать
const entryBag: AnyRec = { id: "5", cid: "6" };
const entryReads = countReads(entryBag);
const entryPath = router.buildPath("u.c", entryBag as never);
out.shells_positive_control = {
  entryBagReads: entryReads.n,
  entryBagKeys: [...entryReads.keys],
  entryPath,
};

// ─── БЛОК 3: getCloneState·return и ·return.options ───
const cs = ctx.getCloneState() as unknown as AnyRec;
const csOptions = cs.options as AnyRec;
out.cloneState_shape = {
  outerFreshPerCall: (ctx.getCloneState() as unknown as AnyRec) !== cs,
  outerFrozen: Object.isFrozen(cs),
  optionsFrozen: Object.isFrozen(csOptions),
  optionsFreshPerCall:
    ((ctx.getCloneState() as unknown as AnyRec).options as AnyRec) !== csOptions,
  control_keys: Object.keys(cs).sort(),
};
const csReads = countReads(cs);
const csOptReads = countReads(csOptions);
// мутируем отданный снапшот: если cloneRouter читает ЕГО, клон поедет
cs.pluginFactories = [];
csOptions.defaultRoute = "u";
// мутация на ОТДЕЛЬНОМ снапшоте без счётчиков (счётный set() глотает запись)
const csM = ctx.getCloneState() as unknown as AnyRec;
const csMOptions = csM.options as AnyRec;
csM.pluginFactories = [];
csMOptions.defaultRoute = "u";
out.cloneState_mutation_landed = {
  handoutOptionsDefaultRouteAfterWrite: csMOptions.defaultRoute,
  handoutPluginFactoriesAfterWrite: Array.isArray(csM.pluginFactories),
};
const clone = cloneRouter(router);
out.cloneState_roundtrip = {
  handoutReadsDuringClone: csReads.n,
  handoutKeys: [...csReads.keys],
  optionsReadsDuringClone: csOptReads.n,
  optionsKeys: [...csOptReads.keys],
  cloneDefaultRoute: (
    getInternals(clone).getOptions() as unknown as AnyRec
  ).defaultRoute,
  baseDefaultRoute: (ctx.getOptions() as unknown as AnyRec).defaultRoute,
};
// контроль вакуумности: мутация ОТДАННОГО options действительно состоялась,
// а свежий снапшот её не несёт
out.cloneState_mutation_control = {
  handoutOptionsDefaultRoute: csOptions.defaultRoute,
  freshSnapshotDefaultRoute: (
    (ctx.getCloneState() as unknown as AnyRec).options as AnyRec
  ).defaultRoute,
};

console.log(JSON.stringify(out, null, 1));
