// Family matrix, part 3 — INSTRUMENT POSITIVE CONTROLS and the two-sided
// descriptor drift that decides whether D1's second gOPD ask is decision-bearing.
//
// Run (from W/benchmarks):
//   NODE_OPTIONS='--conditions=@real-router/internal-source' npx tsx \
//     audit-probes/membrane-globality-2026-09-05/cls-callback-return-.../matrix3.ts
import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

const out = (section: string, data: unknown): void => {
  console.log(`${section} ${JSON.stringify(data)}`);
};

const errText = (e: unknown): string =>
  e instanceof Error ? `${e.constructor.name}: ${e.message}` : String(e);

const attempt = <T>(run: () => T): T | string => {
  try {
    return run();
  } catch (e) {
    return `THREW ${errText(e)}`;
  }
};

// ── INSTRUMENT CONTROL for P3: prove the Object.prototype accessor harness
//    DOES fire on a plain [[Set]] and DOES shadow a plain read. Without this,
//    "setterFired: []" proves nothing.
function p3InstrumentControl(): void {
  const fired: unknown[] = [];
  let reads = 0;

  Object.defineProperty(Object.prototype, "id", {
    configurable: true,
    get(): unknown {
      reads += 1;

      return "FROM_PROTO_GETTER";
    },
    set(v: unknown): void {
      fired.push(v);
    },
  });
  let assignResult: unknown;
  let defineResult: unknown;

  try {
    const viaAssign: Record<string, unknown> = {};

    viaAssign.id = "42";
    assignResult = { own: Object.hasOwn(viaAssign, "id"), read: viaAssign.id };

    const viaDefine: Record<string, unknown> = {};

    Object.defineProperty(viaDefine, "id", {
      value: "42",
      enumerable: true,
      configurable: true,
      writable: true,
    });
    defineResult = { own: Object.hasOwn(viaDefine, "id"), read: viaDefine.id };
  } finally {
    delete (Object.prototype as Record<string, unknown>).id;
  }

  out("P3 INSTRUMENT CONTROL (harness is live)", {
    "[[Set]] fired the inherited setter": fired,
    "[[Set]] result": assignResult,
    "defineProperty result": defineResult,
    protoGetterReads: reads,
  });
}

// ── D1 · is the SECOND gOPD ask on a declared query name decision-bearing?
//    Two-sided descriptor drift on the returned SEARCH bag.
function d1DescriptorDrift(): void {
  const mk = (search: object): ReturnType<typeof createRouter> =>
    createRouter([
      {
        name: "u",
        path: "/u/:id?tab",
        encodeParams: () => ({ params: { id: "9" }, search }),
      },
    ] as never);

  const make = (first: boolean, value: unknown): { bag: object; asks: () => number } => {
    let asks = 0;
    const bag = new Proxy({} as Record<string, unknown>, {
      get(_t, k): unknown {
        return k === "tab" ? value : undefined;
      },
      getOwnPropertyDescriptor(_t, k): PropertyDescriptor | undefined {
        if (k !== "tab") return undefined;
        asks += 1;
        const own = asks === 1 ? first : !first;

        return own
          ? { value, enumerable: true, configurable: true, writable: true }
          : undefined;
      },
      has(_t, k): boolean {
        return k === "tab";
      },
      ownKeys(): string[] {
        return ["tab"];
      },
    });

    return { bag, asks: () => asks };
  };

  const ownFirst = make(true, "OWN_FIRST");
  const rA = mk(ownFirst.bag);

  out("D1x descriptor drift own→absent", {
    href: attempt(() => rA.buildPath("u", { id: "1" })),
    gopdAsks: ownFirst.asks(),
  });
  rA.dispose();

  const absentFirst = make(false, "OWN_SECOND");
  const rB = mk(absentFirst.bag);

  out("D1x descriptor drift absent→own", {
    href: attempt(() => rB.buildPath("u", { id: "1" })),
    gopdAsks: absentFirst.asks(),
  });
  rB.dispose();

  // CONTROLS: honest own, honest absent.
  const rC = mk({ tab: "HONEST" });
  const rD = mk({});

  out("D1x CONTROL honest own / honest absent", {
    own: attempt(() => rC.buildPath("u", { id: "1" })),
    absent: attempt(() => rD.buildPath("u", { id: "1" })),
  });
  rC.dispose();
  rD.dispose();
}

// ── D1 · the same lying bag on the PATH slot: ownKeys denies `id`, gOPD swears.
function d1PathSlotLie(): void {
  const lie = new Proxy({} as Record<string, unknown>, {
    get(_t, k): unknown {
      return k === "id" ? "LIE" : undefined;
    },
    getOwnPropertyDescriptor(_t, k): PropertyDescriptor | undefined {
      return k === "id"
        ? { value: "LIE", enumerable: true, configurable: true, writable: true }
        : undefined;
    },
    has(_t, k): boolean {
      return k === "id";
    },
    ownKeys(): string[] {
      return [];
    },
  });
  const r = createRouter([
    {
      name: "u",
      path: "/u/:id?tab",
      encodeParams: () => ({ params: lie, search: {} }),
    },
  ] as never);

  out("D1x P2 path slot: ownKeys denies `id`, gOPD swears own", {
    href: attempt(() => r.buildPath("u", { id: "1" })),
  });
  r.dispose();

  // The same lie through the DECODE door — normalizeChannel copies by ownKeys.
  const r2 = createRouter([
    {
      name: "u",
      path: "/u/:id?tab",
      decodeParams: () => ({ params: lie, search: {} }),
    },
  ] as never);
  const st = getPluginApi(r2).matchPath("/u/1");

  out("D1x CONTRAST same lie through decodeParams", {
    params: st?.params,
    path: st?.path,
  });
  r2.dispose();
}

p3InstrumentControl();
d1DescriptorDrift();
d1PathSlotLie();
