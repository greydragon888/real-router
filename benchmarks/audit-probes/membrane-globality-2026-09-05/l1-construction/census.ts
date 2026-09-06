// Full-trap Proxy census: every [[…]] operation core performs on a CALLER-owned
// container, counted per trap and per key. Used by the L1-construction probes.
//
// Semantics of the counters (spec-level, not V8-level):
//   ownKeys        – [[OwnPropertyKeys]]: Object.keys / spread / for…in / Object.entries
//   gOPD[key]      – [[GetOwnProperty]]: Object.hasOwn, the enumerability check inside
//                    Object.keys / spread / Object.entries, getOwnPropertyDescriptor
//   get[key]       – [[Get]]
//   has[key]       – [[HasProperty]]: `key in obj`, Array.prototype.map's HasProperty
//   getPrototypeOf – [[GetPrototypeOf]]
//   set / defineProperty / deleteProperty / preventExtensions / setPrototypeOf
//                  – WRITES into the caller's object (must be 0 for a borrowed bag)
export interface Census {
  ownKeys: number;
  getPrototypeOf: number;
  preventExtensions: number;
  setPrototypeOf: number;
  gOPD: Record<string, number>;
  get: Record<string, number>;
  has: Record<string, number>;
  set: Record<string, number>;
  defineProperty: Record<string, number>;
  deleteProperty: Record<string, number>;
}

export interface Censused<T> {
  readonly proxy: T;
  readonly census: Census;
  /** Deep copy of the counters at this moment. */
  snap: () => Census;
  /** Counters accumulated since `since`. */
  delta: (since: Census) => Census;
}

const keyOf = (key: PropertyKey): string =>
  typeof key === "symbol" ? key.toString() : String(key);

// ⚠ Null-prototype tables. The first draft used `{}` and `table[k] ?? 0`, so
// the key `"constructor"` (read by Array.prototype.map's ArraySpeciesCreate)
// resolved to the inherited `Object` function and the count became a string —
// the #1798 / #1840 class, reproduced inside the instrument that measures it.
const table = (): Record<string, number> =>
  Object.create(null) as Record<string, number>;

function bump(t: Record<string, number>, key: PropertyKey): void {
  const k = keyOf(key);

  t[k] = (Object.hasOwn(t, k) ? t[k] : 0) + 1;
}

function emptyCensus(): Census {
  return {
    ownKeys: 0,
    getPrototypeOf: 0,
    preventExtensions: 0,
    setPrototypeOf: 0,
    gOPD: table(),
    get: table(),
    has: table(),
    set: table(),
    defineProperty: table(),
    deleteProperty: table(),
  };
}

function cloneCensus(c: Census): Census {
  const copy = emptyCensus();

  copy.ownKeys = c.ownKeys;
  copy.getPrototypeOf = c.getPrototypeOf;
  copy.preventExtensions = c.preventExtensions;
  copy.setPrototypeOf = c.setPrototypeOf;

  for (const name of ["gOPD", "get", "has", "set", "defineProperty", "deleteProperty"] as const) {
    for (const [k, v] of Object.entries(c[name])) {
      copy[name][k] = v;
    }
  }

  return copy;
}

function diffTable(
  now: Record<string, number>,
  before: Record<string, number>,
): Record<string, number> {
  const out: Record<string, number> = table();

  for (const [k, v] of Object.entries(now)) {
    const d = v - (Object.hasOwn(before, k) ? before[k] : 0);

    if (d !== 0) {
      out[k] = d;
    }
  }

  return out;
}

export function censused<T extends object>(target: T): Censused<T> {
  const census = emptyCensus();
  const proxy = new Proxy(target, {
    ownKeys(t) {
      census.ownKeys += 1;

      return Reflect.ownKeys(t);
    },
    getOwnPropertyDescriptor(t, key) {
      bump(census.gOPD, key);

      return Reflect.getOwnPropertyDescriptor(t, key);
    },
    get(t, key, receiver) {
      bump(census.get, key);

      return Reflect.get(t, key, receiver);
    },
    has(t, key) {
      bump(census.has, key);

      return Reflect.has(t, key);
    },
    getPrototypeOf(t) {
      census.getPrototypeOf += 1;

      return Reflect.getPrototypeOf(t);
    },
    set(t, key, value, receiver) {
      bump(census.set, key);

      return Reflect.set(t, key, value, receiver);
    },
    defineProperty(t, key, desc) {
      bump(census.defineProperty, key);

      return Reflect.defineProperty(t, key, desc);
    },
    deleteProperty(t, key) {
      bump(census.deleteProperty, key);

      return Reflect.deleteProperty(t, key);
    },
    preventExtensions(t) {
      census.preventExtensions += 1;

      return Reflect.preventExtensions(t);
    },
    setPrototypeOf(t, proto) {
      census.setPrototypeOf += 1;

      return Reflect.setPrototypeOf(t, proto);
    },
  });

  return {
    proxy: proxy as T,
    census,
    snap: () => cloneCensus(census),
    delta: (since) => ({
      ownKeys: census.ownKeys - since.ownKeys,
      getPrototypeOf: census.getPrototypeOf - since.getPrototypeOf,
      preventExtensions: census.preventExtensions - since.preventExtensions,
      setPrototypeOf: census.setPrototypeOf - since.setPrototypeOf,
      gOPD: diffTable(census.gOPD, since.gOPD),
      get: diffTable(census.get, since.get),
      has: diffTable(census.has, since.has),
      set: diffTable(census.set, since.set),
      defineProperty: diffTable(census.defineProperty, since.defineProperty),
      deleteProperty: diffTable(census.deleteProperty, since.deleteProperty),
    }),
  };
}

/** Compact rendering: drops empty tables and zero scalars. */
export function compact(c: Census): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  for (const [k, v] of Object.entries(c)) {
    if (typeof v === "number") {
      if (v !== 0) {
        out[k] = v;
      }
    } else if (Object.keys(v as object).length > 0) {
      out[k] = v;
    }
  }

  return out;
}

/** Sum of all write-class traps — must be 0 for a container core only borrows. */
export function writes(c: Census): number {
  const sum = (t: Record<string, number>): number =>
    Object.values(t).reduce((a, b) => a + b, 0);

  return (
    c.preventExtensions +
    c.setPrototypeOf +
    sum(c.set) +
    sum(c.defineProperty) +
    sum(c.deleteProperty)
  );
}

export function show(label: string, value: unknown): void {
  console.log(`${label} ${JSON.stringify(value)}`);
}
