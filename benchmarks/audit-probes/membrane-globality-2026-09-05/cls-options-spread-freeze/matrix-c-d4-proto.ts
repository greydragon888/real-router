/**
 * Добивка по D4 (cloneRouter·opts.logger): достаёт ли отравление
 * Object.prototype до КЛОНА — т.е. разделяет ли D4 нарушение P3 двери D3
 * ниже по потоку (assertLoggerConfig · normalized — обычный литерал, [[Set]]).
 */
import { createRouter } from "@real-router/core";
import { cloneRouter } from "@real-router/core/api";

import { getInternals } from "../../../../packages/core/src/internals";

const R = [{ name: "u", path: "/u/:id?tab" }] as never;
const say = (k: string, v: unknown): void =>
  console.log(`${k}: ${JSON.stringify(v)}`);

const base = createRouter(R, { logger: { level: "all" } } as never);

// Контроль БЕЗ отравления: override level="none" доходит до клона.
const ctl = cloneRouter(base as never, undefined, {
  logger: { level: "none" } as never,
});
say(
  "control · клон без отравления",
  JSON.stringify(getInternals(ctl as never).getCloneState().loggerConfig),
);

const proto = Object.prototype as unknown as Record<string, unknown>;
const trapped: unknown[] = [];
const out: [string, unknown][] = [];
Object.defineProperty(proto, "level", {
  configurable: true,
  get: (): unknown => undefined,
  set: (v: unknown): void => {
    trapped.push(v);
  },
});
try {
  const clone = cloneRouter(base as never, undefined, {
    logger: { level: "none" } as never,
  });
  out.push([
    "D4 · клон при отравленном Object.prototype.level",
    JSON.stringify(getInternals(clone as never).getCloneState().loggerConfig),
  ]);
  out.push(["D4 · сеттер прототипа перехватил", trapped.slice()]);
} finally {
  delete proto.level;
}
for (const [k, v] of out) say(k, v);
say("прототип очищен", Object.hasOwn(proto, "level"));
