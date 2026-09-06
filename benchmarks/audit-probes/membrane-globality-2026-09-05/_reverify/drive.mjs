// Чередующиеся ПРОЦЕССЫ: X Y X Y … Одна арма на процесс.
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ARM = path.join(HERE, process.env.ARM_FILE ?? "pending-shell-arm.ts");
const CWD = path.resolve(HERE, "../../..");           // benchmarks/

const [x, y] = (process.argv[2] ?? "A:B").split(":");
const ITERS = Number(process.argv[3] ?? 20000);
const ROUNDS = Number(process.argv[4] ?? 9);

const one = (arm) =>
  Number(
    execFileSync("npx", ["tsx", ARM, arm, String(ITERS)], {
      cwd: CWD,
      encoding: "utf8",
      env: { ...process.env, NODE_OPTIONS: "--conditions=@real-router/internal-source" },
    }).trim(),
  );

const X = [], Y = [];
for (let r = 0; r < ROUNDS; r++) { X.push(one(x)); Y.push(one(y)); }
const med = (a) => a.toSorted((p, q) => p - q)[a.length >> 1];
const mx = med(X), my = med(Y);
console.log(`  ${x} : ${X.map((v) => v.toFixed(0)).join(" ")}   медиана ${mx.toFixed(0)} нс`);
console.log(`  ${y} : ${Y.map((v) => v.toFixed(0)).join(" ")}   медиана ${my.toFixed(0)} нс`);
console.log(`  дельта ${y} против ${x} = ${((my / mx - 1) * 100).toFixed(1)} %`);
