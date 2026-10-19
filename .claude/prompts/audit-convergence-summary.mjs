// node .claude/prompts/audit-convergence-summary.mjs <реестр.tsv>... — счёты и доли по раундам; значение вне словаря колонки — ошибка.
import { readFileSync } from "node:fs";
const V = {
  3: [
    "пропагация",
    "ложная посылка",
    "открытая область",
    "гейт",
    "адрес/счёт/замер",
    "формулировка",
  ],
  4: ["дельта", "старше базы", "внешнее", "неизвестно"],
  5: ["аудит", "автор", "внешнее"],
  6: ["дерево", "документ", "класс", "нет", "—"],
  8: ["B", "S", "M", "У"],
};
const rounds = new Map();
for (const file of process.argv.slice(2)) {
  for (const line of readFileSync(file, "utf8").trim().split("\n").slice(1)) {
    const c = line.split("\t");
    const [round, id, , cls, place, author, form, agents, sevNow, repeat] = c;
    for (const [i, v] of Object.entries(V))
      if (!v.includes(c[i]))
        throw new Error(`${file}: ${round} ${id}: «${c[i]}» вне словаря`);
    if (!/^\d+!?$/.test(agents) || repeat === undefined)
      throw new Error(
        `${file}: ${round} ${id}: «агентов нашли» или «повтор» не по формату`,
      );
    const r = rounds.get(round) ?? {
      n: 0,
      sev: {},
      повтор: 0,
      дельта: 0,
      пропагация: 0,
      "адрес/счёт/замер": 0,
      "открытая область": 0,
      "автор аудит": 0,
      "оценки разошлись": 0,
    };
    r.n++;
    r.sev[sevNow] = (r.sev[sevNow] ?? 0) + 1;
    if (repeat !== "—") r.повтор++;
    if (place === "дельта") r.дельта++;
    if (cls in r) r[cls]++;
    if (form !== "—") r[`форма: ${form}`] = (r[`форма: ${form}`] ?? 0) + 1;
    if (author === "аудит") r["автор аудит"]++;
    if (agents.endsWith("!")) r["оценки разошлись"]++;
    rounds.set(round, r);
  }
}
for (const [round, { n, sev, ...shares }] of rounds) {
  console.log(
    `${round}  всего ${n}  ${JSON.stringify(sev)}  ` +
      Object.entries(shares)
        .map(([k, v]) => `${k} ${v}/${n}`)
        .join("  "),
  );
}
