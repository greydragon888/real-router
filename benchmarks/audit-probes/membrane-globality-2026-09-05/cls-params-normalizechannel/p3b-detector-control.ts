// Позитивный контроль ДЕТЕКТОРА столбца P3b в matrix.ts.
// Там на всех семи дверях `publishedProtoIsObjectPrototype: true` и
// `publishedKeys: ["id"]` — но зелёный детектор ничего не доказывает, пока не
// показано, что он способен покраснеть. Здесь тот же мешок из JSON.parse
// прогоняется через ТРИ копира и печатается тот же предикат:
//   naive  — `t[k] = bag[k]` по Object.keys           → ДОЛЖЕН подменить прототип;
//   assign — Object.assign({}, bag)                   → ключ теряется ([[Set]]);
//   define — Object.defineProperty (форма `putField`) → собственный ключ, прототип цел.
const bag = JSON.parse('{"id":"7","__proto__":{"polluted":true}}') as Record<
  string,
  unknown
>;

const probe = (t: Record<string, unknown>) => ({
  keys: Object.keys(t),
  protoIsObjectPrototype: Object.getPrototypeOf(t) === Object.prototype,
  protoHasPolluted: Boolean(
    (Object.getPrototypeOf(t) as Record<string, unknown> | null)?.polluted,
  ),
});

const naive: Record<string, unknown> = {};
for (const k of Object.keys(bag)) {
  // eslint-disable-next-line no-proto -- это и есть демонстрируемый примитив
  naive[k] = bag[k];
}

const assigned = Object.assign({}, bag) as Record<string, unknown>;

const defined: Record<string, unknown> = {};
for (const k of Object.keys(bag)) {
  Object.defineProperty(defined, k, {
    value: bag[k],
    writable: true,
    enumerable: true,
    configurable: true,
  });
}

console.log(
  JSON.stringify(
    {
      bagHasOwnProto: Object.hasOwn(bag, "__proto__"),
      naive: probe(naive),
      assign: probe(assigned),
      define: probe(defined),
    },
    null,
    1,
  ),
);
