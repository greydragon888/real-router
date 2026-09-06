// Разворачивает запись onStart в остальные шесть дверей семейства: механизм,
// армы и контроли общие (shared), различаются событие, счётчики и hotPath.
import fs from "node:fs";

const p = new URL("./verdict.json", import.meta.url);
const v = JSON.parse(fs.readFileSync(p, "utf8"));
const base = v.doors[0];

const rows = [
  {
    hook: "onStop",
    ev: "$stop",
    reg: "EVENTS_MAP[ROUTER_STOP]",
    h: "2/1",
    pl: "1/0",
    dr: "3/0",
    hot: "boot-only (эмит ROUTER_STOP из EventBusNamespace · emitRouterStop на Router.stop; плюс отписка плагина через cleanup в #startPlugin)",
    reach:
      "счётчик onStop ненулевой только после router.stop(); arm plain даёт ровно 1 чтение и 0 вызовов — ветка достигнута и различима.",
  },
  {
    hook: "onTransitionStart",
    ev: "$$start",
    reg: "EVENTS_MAP[TRANSITION_START]",
    h: "8/4",
    pl: "4/0",
    dr: "12/0",
    hot: "per-navigation (эмит TRANSITION_START из EventBusNamespace на каждой навигации: start, navigate b, ошибочная, отменённая — в прогоне ровно 4 инвокации)",
    reach:
      "8 чтений при 4 вызовах = 4 инвокации × 2 чтения; в arm plain 4 чтения и 0 вызовов — по одному на инвокацию, ветка достигнута.",
  },
  {
    hook: "onTransitionLeaveApprove",
    ev: "$$leaveApprove",
    reg: "EVENTS_MAP[TRANSITION_LEAVE_APPROVE]",
    h: "8/4",
    pl: "4/0",
    dr: "12/0",
    hot: "per-navigation с деактивацией (guardPhase.ts · emitLeaveApprove → EventBusNamespace.emitTransitionLeaveApprove из FSM-действия)",
    reach:
      "4 инвокации при навигациях с деактивацией; arm plain — 4 чтения, 0 вызовов.",
  },
  {
    hook: "onTransitionSuccess",
    ev: "$$success",
    reg: "EVENTS_MAP[TRANSITION_SUCCESS]",
    h: "6/3",
    pl: "3/0",
    dr: "9/0",
    hot: "per-navigation, успешная арка (EventBusNamespace · emitTransitionSuccess из арок COMMITTED)",
    reach:
      "3 инвокации = три успешные навигации прогона (start /a, navigate b, встречная navigate a); arm plain — 3 чтения, 0 вызовов.",
  },
  {
    hook: "onTransitionError",
    ev: "$$error",
    reg: "EVENTS_MAP[TRANSITION_ERROR]",
    h: "2/1",
    pl: "1/0",
    dr: "3/0",
    hot: "per-navigation, ошибочная ветвь + плагинный канал (NavigationNamespace ×3, executeNavigation, navigateToNotFound, EventBusNamespace ×2, Router.ts · registerInternals · emitTransitionError через getPluginApi)",
    reach:
      "счётчик появляется только после навигации в несуществующий маршрут; без неё строки в выводе нет вовсе.",
  },
  {
    hook: "onTransitionCancel",
    ev: "$$cancel",
    reg: "EVENTS_MAP[TRANSITION_CANCEL]",
    h: "2/1",
    pl: "1/0",
    dr: "3/0",
    hot: "per-navigation, только отменённые (EventBusNamespace · emitTransitionCancel — единственный сайт, FSM-арка CANCEL)",
    reach:
      "счётчик ненулевой только в прогоне со встречной навигацией поверх медленного canActivate; без арки отмены строка отсутствует.",
  },
];

for (const r of rows) {
  const d = structuredClone(base);
  const [hr, hc] = r.h.split("/");
  const [pr, pc] = r.pl.split("/");
  const [dr, dc] = r.dr.split("/");

  d.id = `Plugin.${r.hook}·return`;
  d.mechanism = `см. shared.mechanism; регистрация — ${r.reg} → событие ${r.ev}.`;
  d.proof.decisiveOutput =
    `hostile: "${r.hook}": {reads:${hr}, calls:${hc}}; plain: {reads:${pr}, calls:${pc}}; ` +
    `driftReject: {reads:${dr}, calls:${dc}}, __sink=[]; ` +
    `stableReject: __sink содержит "Router|Error in listener for ${r.ev}:|REJECTED_${r.hook}"; ` +
    `copyPromise: __unhandled содержит "copyPromise:REJECTED_${r.hook}", __sink=[]`;
  d.proof.positiveControl = `stableReject — стабильный отвергающий thenable той же формы доводит ошибку до #onListenerError (строка ${r.ev} в __sink); plain — не-функция \`then\` читается один раз на инвокацию и не вызывается.`;
  d.proof.reachedBranch = r.reach;
  d.cost.hotPath = r.hot;
  d.p4.reason = d.p4.reason.replace('"onStart:false"', `"${r.hook}:false"`);
  v.doors.push(d);
}

fs.writeFileSync(p, `${JSON.stringify(v, null, 2)}\n`);
console.log("doors:", v.doors.map((d) => d.id).join(" | "));
