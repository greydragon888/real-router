// Опровергатель · ЗАМЕР. Классификатор не мерил ни одной двери семейства.
// Вопрос: если горло (копия контейнера) поставить ВНУТРИ печатающей двери
// (port().buildPath), сколько это стоит на кадре рендера <Link>, где мешок —
// объект ЯДРА (canonicalize уже построил его)?
// Арм A — сегодняшняя дверь. Арм B — та же дверь + две spread-копии каналов.
// Чередование армов, 9 раундов, медианы, пол A/A.
import { createRouter } from "@real-router/core";

const router = createRouter(
  [
    { name: "home", path: "/home" },
    { name: "u", path: "/u/:id?tab" },
  ] as never,
  { defaultRoute: "home" } as never,
  {} as never,
);

const params = { id: "7" } as never;
const search = { tab: "x" } as never;

// позитивный контроль: обе формы печатают одно и то же
const ctlA = router.buildPath("u", params, search);
const ctlB = router.buildPath("u", { ...(params as object) } as never, {
  ...(search as object),
} as never);

const N = 150_000;

function armA(): number {
  const t = process.hrtime.bigint();
  let sink = 0;

  for (let i = 0; i < N; i++)
    sink += router.buildPath("u", params, search).length;
  const d = Number(process.hrtime.bigint() - t) / N;

  if (sink === 0) throw new Error("dead");

  return d;
}

function armB(): number {
  const t = process.hrtime.bigint();
  let sink = 0;

  for (let i = 0; i < N; i++) {
    sink += router.buildPath(
      "u",
      { ...(params as object) } as never,
      { ...(search as object) } as never,
    ).length;
  }
  const d = Number(process.hrtime.bigint() - t) / N;

  if (sink === 0) throw new Error("dead");

  return d;
}

const med = (xs: number[]): number =>
  [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;

armA();
armB();
armA();
armB();

const a: number[] = [];
const b: number[] = [];
const a2: number[] = [];

for (let r = 0; r < 9; r++) {
  a.push(armA());
  b.push(armB());
  a2.push(armA());
}

const mA = med(a);
const mB = med(b);
const mA2 = med(a2);

console.log(
  JSON.stringify(
    {
      control: { ctlA, ctlB, same: ctlA === ctlB },
      nsPerOp: {
        armA: +mA.toFixed(1),
        armB: +mB.toFixed(1),
        armA2: +mA2.toFixed(1),
      },
      floorAA_pct: +(((mA2 - mA) / mA) * 100).toFixed(2),
      deltaPct_B_over_A: +(((mB - mA) / mA) * 100).toFixed(2),
    },
    null,
    1,
  ),
);
