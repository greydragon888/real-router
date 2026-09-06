// ADDENDUM to the family matrix: the constructor's FIXED-NAME writes.
//
// `matrix.ts` probes P3 for a CALLER-CHOSEN key (`extra`) and shows `putField`
// takes the define branch. But the same door — the options bag — also carries
// three fixed names, and `RouterError.ts · constructor` writes them with plain
// assignment (`this.code = code; this.segment = segment; this.path = path;`),
// not `putField`. `this.name = "RouterError"` is a fourth. If any of those four
// resolves through the prototype chain, the #1852 form is open on this door for
// values the caller supplied.
//
// Shape read from source before writing (RouterError.ts · constructor):
//   constructor(code: string, { message, segment, path, ...rest } = {})
//   → super(message ?? code); this.name = "RouterError";
//     this.code = code; this.segment = segment; this.path = path;
//
// Run (from W/benchmarks):
//   NODE_OPTIONS='--conditions=@real-router/internal-source' npx tsx \
//     audit-probes/membrane-globality-2026-09-05/cls-routererror-объекты-приложения-на-ошибке-ядра/addendum-fixed-name-writes.ts
import { RouterError } from "@real-router/core";

const out: Record<string, unknown> = {};
const rd = (o: object, k: string): unknown => (o as Record<string, unknown>)[k];

// POSITIVE CONTROL — the ambient accessor mechanism actually fires on a plain
// [[Set]] to a fresh object whose chain reaches Object.prototype.
{
  const seen: unknown[] = [];

  Object.defineProperty(Object.prototype, "segment", {
    configurable: true,
    get: () => "HIJACKED",
    set: (v: unknown) => {
      seen.push(v);
    },
  });

  let ownAfter: boolean | null = null;
  let readsBack: unknown = null;

  try {
    const plain: Record<string, unknown> = {};

    plain.segment = "VALUE";
    ownAfter = Object.hasOwn(plain, "segment");
    readsBack = plain.segment;
  } finally {
    delete (Object.prototype as Record<string, unknown>).segment;
  }

  out.controlAmbientSetterWorks = {
    setterCalls: seen.length,
    ownAfterWrite: ownAfter,
    readsBackAs: readsBack,
  };
}

// Are the four names OWN on a freshly built instance BEFORE any hostile chain?
{
  const e = new RouterError("CTRL", { segment: "s", path: "/p" });

  out.ownnessOnCleanInstance = {
    code: Object.hasOwn(e, "code"),
    segment: Object.hasOwn(e, "segment"),
    path: Object.hasOwn(e, "path"),
    name: Object.hasOwn(e, "name"),
    message: Object.hasOwn(e, "message"),
    values: {
      code: e.code,
      segment: e.segment,
      path: e.path,
      name: e.name,
      message: e.message,
    },
  };
}

// The real question: install an ambient accessor under each fixed name and
// construct. Strictly try/finally with removal.
function ambient(
  name: string,
  build: () => RouterError,
): Record<string, unknown> {
  const seen: unknown[] = [];
  let threw: string | null = null;
  let built: RouterError | null = null;

  Object.defineProperty(Object.prototype, name, {
    configurable: true,
    get: () => "HIJACKED",
    set: (v: unknown) => {
      seen.push(v);
    },
  });

  try {
    built = build();
  } catch (error) {
    threw = String(error);
  } finally {
    delete (Object.prototype as Record<string, unknown>)[name];
  }

  return {
    ambientSetterCalls: seen.length,
    ownAfterWrite: built ? Object.hasOwn(built, name) : null,
    readsBackAfterRemoval: built ? rd(built, name) : null,
    threw,
  };
}

out.ctorFixedNames = {
  segment: ambient("segment", () => new RouterError("P3", { segment: "S" })),
  path: ambient("path", () => new RouterError("P3", { path: "/P" })),
  code: ambient("code", () => new RouterError("CODEVAL")),
  name: ambient("name", () => new RouterError("P3")),
  message: ambient("message", () => new RouterError("P3", { message: "M" })),
};

// P2 for the three destructured names: they are read BY NAME ([[Get]]), not by
// enumeration, so a Proxy that hides them from `ownKeys` cannot keep them out.
// Recorded as evidence for the "неприменимо" verdict on that slot, not as a
// defect: `message`/`segment`/`path` are core's own names, not caller keys.
{
  const target = { message: "M", segment: "S", path: "/P", ghost: "G" };
  const asked: string[] = [];
  const bag = new Proxy(target, {
    ownKeys: () => ["message"], // hides segment, path and ghost
    getOwnPropertyDescriptor: (t, k) => {
      asked.push(String(k));

      return Object.getOwnPropertyDescriptor(t, k);
    },
  }) as Record<string, unknown>;

  const e = new RouterError("P2", bag);

  out.p2FixedNamesViaLyingProxy = {
    segmentSurvivedHiding: e.segment,
    pathSurvivedHiding: e.path,
    messageSurvivedHiding: e.message,
    ghostLanded: Object.hasOwn(e, "ghost"),
    descriptorAskedFor: asked,
  };
}

console.log(JSON.stringify(out, null, 1));
