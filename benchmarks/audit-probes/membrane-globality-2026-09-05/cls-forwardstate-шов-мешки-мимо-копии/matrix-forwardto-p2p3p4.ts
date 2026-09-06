// MATRIX supplement — P2 / P3 / P4 cells for the round-trip door
// `ForwardToCallback·params`, i.e. the DYNAMIC forward branch
// (`RoutesNamespace.ts · #resolveDynamicForward` → `#layerChainDefaults`).
//
// `matrix.ts` puts P2/P3 on routes `f` (STATIC forward + hop defaults) and `u`
// (pass-through). This file repeats them on route `d`, whose `forwardTo` is a
// CALLBACK, so the bag really does travel through application code between the
// entrance and the merge.
//
// Run (from W/benchmarks):
//   NODE_OPTIONS='--conditions=@real-router/internal-source' npx tsx \
//     audit-probes/membrane-globality-2026-09-05/cls-forwardstate-шов-мешки-мимо-копии/matrix-forwardto-p2p3p4.ts
import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

import { countingBag, driftingBag } from "../../../../packages/core/tests/helpers/hostileBags";

type Bag = Record<string, unknown>;

const out = (section: string, data: unknown): void => {
  console.log(`${section} ${JSON.stringify(data)}`);
};

const errText = (e: unknown): string =>
  e instanceof Error ? `${e.constructor.name}: ${e.message}` : String(e);

const attempt = async <T>(run: () => T | Promise<T>): Promise<T | string> => {
  try {
    return await run();
  } catch (e) {
    return `THREW ${errText(e)}`;
  }
};

let hopSaw: { keys: string[]; secret: unknown; proto: unknown } = {
  keys: [],
  secret: undefined,
  proto: undefined,
};

const ROUTES = (): unknown[] => [
  { name: "home", path: "/home" },
  { name: "b", path: "/b/:id" },
  // dynamic hop WITH defaults: core writes `z` into its own merged container
  // AFTER the callback ran (`#layerChainDefaults`).
  {
    name: "d",
    path: "/d/:id",
    defaultParams: { z: "hop" },
    forwardTo: (_g: unknown, p: Bag) => {
      hopSaw = {
        keys: Object.keys(p),
        secret: p.secret,
        proto: Object.getPrototypeOf(p) === Object.prototype ? "Object.prototype" : "other",
      };

      return "b";
    },
  },
];

const mk = (): ReturnType<typeof createRouter> =>
  createRouter(ROUTES() as never, {} as never);

// ── P2 — lying Proxy: ownKeys hides `secret`, gOPD claims it is own ─────────
const lying = (source: Bag, hidden: string): Bag =>
  new Proxy(source, {
    ownKeys: (t) => Reflect.ownKeys(t).filter((k) => k !== hidden),
    getOwnPropertyDescriptor: (t, k) =>
      k === hidden
        ? { value: (t as Bag)[k as string], enumerable: true, configurable: true, writable: true }
        : Reflect.getOwnPropertyDescriptor(t, k),
  });

async function sectionP2(): Promise<void> {
  {
    const r = mk();

    await r.start("/home");

    const bag = lying({ id: "7", secret: "S" }, "secret");
    const st = await attempt(() => r.navigate("d", bag as never));

    out("P2a-d lying proxy through the DYNAMIC forward callback", {
      "Object.keys sees": Object.keys(bag),
      "hasOwn says": Object.hasOwn(bag, "secret"),
      "the callback saw keys": hopSaw.keys,
      "the callback read secret directly": hopSaw.secret,
      "state.params": typeof st === "string" ? st : { ...(st as { params: Bag }).params },
      "state.path": typeof st === "string" ? st : (st as { path: string }).path,
    });
    r.dispose();
  }

  // control — the same bag WITHOUT the lie: `secret` must land.
  {
    const r = mk();

    await r.start("/home");

    const st = await attempt(() => r.navigate("d", { id: "7", secret: "S" } as never));

    out("P2b-d control — honest bag, same route", {
      "the callback saw keys": hopSaw.keys,
      "state.params": typeof st === "string" ? st : { ...(st as { params: Bag }).params },
    });
    r.dispose();
  }
}

// ── P3 — inherited accessor + own "__proto__" through the callback branch ──
async function sectionP3(): Promise<void> {
  {
    const hits: string[] = [];

    Object.defineProperty(Object.prototype, "z", {
      configurable: true,
      get(): unknown {
        hits.push("get");

        return "INHERITED";
      },
      set(): void {
        hits.push("set");
      },
    });

    try {
      const r = mk();

      await r.start("/home");

      const st = await attempt(() => r.navigate("d", { id: "7" } as never));

      out("P3a-d inherited accessor `z` while the dynamic hop merges defaultParams", {
        "setter fired": hits.includes("set"),
        hits: hits.length,
        "state.params.z": typeof st === "string" ? st : (st as { params: Bag }).params.z,
        "hasOwn z on state.params":
          typeof st === "string" ? st : Object.hasOwn((st as { params: Bag }).params, "z"),
        "state.path": typeof st === "string" ? st : (st as { path: string }).path,
      });
      r.dispose();
    } finally {
      delete (Object.prototype as unknown as Bag).z;
    }
  }

  // control — no accessor installed.
  {
    const r = mk();

    await r.start("/home");

    const st = await attempt(() => r.navigate("d", { id: "7" } as never));

    out("P3b-d control — no accessor", {
      "state.params.z": typeof st === "string" ? st : (st as { params: Bag }).params.z,
      "state.path": typeof st === "string" ? st : (st as { path: string }).path,
    });
    r.dispose();
  }

  // own "__proto__" from JSON.parse, through the callback branch.
  {
    const r = mk();

    await r.start("/home");

    const poison = JSON.parse('{"id":"7","__proto__":{"pwned":1}}') as Bag;
    const st = await attempt(() => r.navigate("d", poison as never));

    out("P3c-d own __proto__ through the dynamic forward branch", {
      "caller bag has own __proto__": Object.hasOwn(poison, "__proto__"),
      "the callback saw keys": hopSaw.keys,
      "state.params has own __proto__":
        typeof st === "string" ? st : Object.hasOwn((st as { params: Bag }).params, "__proto__"),
      "spreading state.params swaps the prototype":
        typeof st === "string"
          ? st
          : ({ ...(st as { params: Bag }).params } as { pwned?: number }).pwned === 1,
      "Object.prototype polluted": ({} as { pwned?: number }).pwned,
      "state.path": typeof st === "string" ? st : (st as { path: string }).path,
    });
    r.dispose();
  }
}

// ── P4 — freeze depth on the dynamic branch ────────────────────────────────
async function sectionP4(): Promise<void> {
  const r = mk();

  await r.start("/home");

  const nested = { deep: "L" };
  const bag: Bag = { id: "7", nested };
  const st = await r.navigate("d", bag as never);
  const stp = st.params as unknown as Bag;

  out("P4-d freeze depth through the dynamic forward callback", {
    "caller's container frozen": Object.isFrozen(bag),
    "caller's NESTED container frozen": Object.isFrozen(nested),
    "state.params frozen (core-minted level)": Object.isFrozen(stp),
    "state.params.nested === caller's nested": (stp.nested as unknown) === nested,
    "state.params.nested frozen": Object.isFrozen(stp.nested as object),
    "state.search frozen": Object.isFrozen(st.search),
    "state.path": st.path,
  });
  r.dispose();
}

// ── P1 — per-key reads on the dynamic branch, drifting vs stable ───────────
async function sectionP1(): Promise<void> {
  {
    const r = mk();

    await r.start("/home");

    const d = driftingBag<Bag>({ id: "7" }, { id: "8" });
    const st = await attempt(() => r.navigate("d", d.bag as never));

    out("P1a-d drifting bag through the dynamic forward callback", {
      "reads on the caller bag (callback + core)": { ...d.reads },
      "the callback saw id": hopSaw.keys.length > 0 ? "ran" : "did not run",
      "state.params": typeof st === "string" ? st : { ...(st as { params: Bag }).params },
      "state.path": typeof st === "string" ? st : (st as { path: string }).path,
    });
    r.dispose();
  }

  {
    const r = mk();

    await r.start("/home");

    const c = countingBag<Bag>({ id: "7" });
    const st = await attempt(() => r.navigate("d", c.bag as never));

    out("P1b-d control — stable bag, same route", {
      reads: { ...c.reads },
      "state.params": typeof st === "string" ? st : { ...(st as { params: Bag }).params },
      "state.path": typeof st === "string" ? st : (st as { path: string }).path,
    });
    r.dispose();
  }
}

void (async () => {
  await sectionP1();
  await sectionP2();
  await sectionP3();
  await sectionP4();
})();
