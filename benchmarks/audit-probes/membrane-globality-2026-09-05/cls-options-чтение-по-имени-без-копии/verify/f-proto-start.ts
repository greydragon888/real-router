/**
 * ОПРОВЕРГАТЕЛЬ, дверь resolveForwardChain·forwardMap — незакрытый пункт
 * классификатора: стартовое имя, совпадающее с членом Object.prototype, на
 * карте БЕЗ собственного такого ключа (чтение уходит по цепочке прототипов).
 * Сигнатура прочитана из исходника: resolveForwardChain(startRoute, forwardMap,
 * maxDepth = 100): string.
 */
import { resolveForwardChain } from "@real-router/core";

const out: Record<string, unknown> = {};
const run = (start: string, map: Record<string, string>): unknown => {
  try {
    return resolveForwardChain(start, map);
  } catch (error) {
    return `throw: ${(error as Error).message.slice(0, 120)}`;
  }
};

// ПОЗИТИВНЫЙ КОНТРОЛЬ: обычная цепочка проходится (иначе нули ниже — не данные).
out.posControl_chain = run("a", { a: "b", b: "c" });

// Карта-литерал БЕЗ собственного "__proto__"/"toString": чтение по цепочке.
const plain: Record<string, string> = { a: "b", b: "c" };
out.protoStart_onPlainMap = run("__proto__", plain);
out.toStringStart_onPlainMap = run("toString", plain);
out.constructorStart_onPlainMap = run("constructor", plain);
out.valueOfStart_onPlainMap = run("valueOf", plain);

// Та же карта без прототипа — контраст: унаследованного члена не существует.
const bare = Object.create(null) as Record<string, string>;
bare.a = "b";
bare.b = "c";
out.protoStart_onNullProtoMap = run("__proto__", bare);
out.toStringStart_onNullProtoMap = run("toString", bare);

// Достигается ли унаследованный член ИЗ СЕРЕДИНЫ цепочки (не только со старта).
out.hopIntoInheritedMember = run("a", { a: "toString" });

// Глобальный прототип не отравлен пробой.
out.globalProtoUnpolluted =
  ({} as Record<string, unknown>).a === undefined &&
  Object.getPrototypeOf({}) === Object.prototype;

console.log(JSON.stringify(out, null, 1));
