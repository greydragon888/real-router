// MATRIX for the family «RouterError · application objects on a core error».
// Rows: the three doors — constructor(code, options), setAdditionalFields(fields),
// setErrorInstance(err). Columns: experiment (a) [pre-copied container vs the
// original], P1 [one read per key, first read decides], P2 [lying Proxy],
// P3 [ambient accessor + own "__proto__"], P4 [what freezes at the throw].
//
// Run (from W/benchmarks):
//   NODE_OPTIONS='--conditions=@real-router/internal-source' npx tsx \
//     audit-probes/membrane-globality-2026-09-05/cls-routererror-объекты-приложения-на-ошибке-ядра/matrix.ts
//
// Shapes read from source before writing (RouterError.ts):
//   constructor(code: string, { message, segment, path, ...rest } = {})
//   setAdditionalFields(fields: Record<string, unknown>): void
//   setErrorInstance(err: Error): void      // this.message/.cause/.stack = err.*
// ⚠ The bag is the SECOND argument of the constructor; a probe that puts it
// first reports a false negative on the leaf test.
import { createRouter, RouterError } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";

import {
  countingBag,
  driftingBag,
} from "../../../../packages/core/tests/helpers/hostileBags";

const out: Record<string, unknown> = {};

const ownKeys = (o: object): string[] => Object.keys(o).sort();
const rd = (o: object, k: string): unknown =>
  (o as Record<string, unknown>)[k];

// ───────────────────────── HEADER: positive controls ─────────────────────────
// Legal, boring input through each of the three doors. Everything below is read
// against these; if a control moves, the probe is broken, not the door.
{
  const leaf = { svc: "LEAF" };
  const e = new RouterError("CTRL", {
    message: "m",
    segment: "s",
    path: "/p",
    extra: leaf,
  });

  e.setAdditionalFields({ userId: "u1" });

  const src = new Error("orig");

  (src as { cause?: unknown }).cause = leaf;
  e.setErrorInstance(src);

  out.control = {
    ctorFieldsLanded: {
      code: e.code,
      segment: e.segment,
      path: e.path,
      extraIsLeaf: rd(e, "extra") === leaf,
    },
    additionalLanded: rd(e, "userId"),
    instanceLanded: {
      message: e.message,
      causeIsLeaf: rd(e, "cause") === leaf,
      stackIsString: typeof e.stack === "string",
    },
    instanceofIntact: e instanceof RouterError,
    ownKeys: ownKeys(e),
  };
}

// ───────────── EXPERIMENT (a) — pre-copied container vs the original ─────────
{
  const leaf = { svc: "LEAF" };
  const nested = { deep: { x: 1 } };

  // A — constructor
  const origA = {
    message: "m",
    segment: "s",
    path: "/p",
    extra: leaf,
    nested,
  };
  const copyA = { ...origA }; // shallow: same leaves, new container
  const eOrig = new RouterError("A", origA);
  const eCopy = new RouterError("A", copyA);

  const eqA = {
    sameJson: JSON.stringify(eOrig.toJSON()) === JSON.stringify(eCopy.toJSON()),
    sameOwnKeys:
      JSON.stringify(ownKeys(eOrig)) === JSON.stringify(ownKeys(eCopy)),
  };

  // mutate the caller's original AFTER the call — does core see it?
  origA.message = "MUTATED";
  (origA as Record<string, unknown>).late = "LATE";
  // mutate what core produced — does the caller's bag see it?
  (eOrig as unknown as Record<string, unknown>).addedOnError = 1;

  out.expA_ctor = {
    ...eqA,
    bothInstanceof:
      eOrig instanceof RouterError && eCopy instanceof RouterError,
    leafIdentityBothArms:
      rd(eOrig, "extra") === leaf && rd(eCopy, "extra") === leaf,
    nestedIdentityBothArms:
      rd(eOrig, "nested") === nested && rd(eCopy, "nested") === nested,
    lateCallerMutationVisibleToCore: rd(eOrig, "late") !== undefined,
    callerMessageMutationVisible: eOrig.message === "MUTATED",
    coreMutationVisibleToCaller: "addedOnError" in origA,
  };

  // B — setAdditionalFields
  const origB = { userId: "u1", svc: leaf };
  const copyB = { ...origB };
  const eB1 = new RouterError("B");
  const eB2 = new RouterError("B");

  eB1.setAdditionalFields(origB);
  eB2.setAdditionalFields(copyB);

  const eqB =
    JSON.stringify(eB1.toJSON()) === JSON.stringify(eB2.toJSON());

  origB.userId = "MUTATED";
  (origB as Record<string, unknown>).late = "LATE";
  (eB1 as unknown as Record<string, unknown>).addedOnError = 1;

  out.expA_setAdditionalFields = {
    sameJson: eqB,
    leafIdentityBothArms: rd(eB1, "svc") === leaf && rd(eB2, "svc") === leaf,
    lateCallerMutationVisibleToCore: rd(eB1, "late") !== undefined,
    callerMutationVisible: rd(eB1, "userId") === "MUTATED",
    coreMutationVisibleToCaller: "addedOnError" in origB,
  };

  // C — setErrorInstance (the "container" is the caller's Error)
  const causeLeaf = { why: "cause-leaf" };
  const srcOrig = new Error("orig-msg");

  (srcOrig as { cause?: unknown }).cause = causeLeaf;
  srcOrig.stack = "STACK-C";

  const srcCopy = new Error(srcOrig.message);

  (srcCopy as { cause?: unknown }).cause = srcOrig.cause;
  srcCopy.stack = srcOrig.stack;

  const eC1 = new RouterError("C");
  const eC2 = new RouterError("C");

  eC1.setErrorInstance(srcOrig);
  eC2.setErrorInstance(srcCopy);
  srcOrig.message = "MUTATED";
  (srcOrig as { cause?: unknown }).cause = { why: "swapped" };

  out.expA_setErrorInstance = {
    sameMessage: eC1.message === eC2.message,
    sameStack: eC1.stack === eC2.stack,
    causeLeafIdentityBothArms:
      rd(eC1, "cause") === causeLeaf && rd(eC2, "cause") === causeLeaf,
    lateCallerMutationVisibleToCore: eC1.message === "MUTATED",
  };
}

// ───────────────────────────── P1 — one read per key ────────────────────────
{
  const ctorCount = countingBag({
    message: "m",
    segment: "s",
    path: "/p",
    extra: 1,
  });
  const eCount = new RouterError("P1", ctorCount.bag as never);

  const ctorDrift = driftingBag(
    { message: "FIRST", segment: "FIRST", path: "FIRST", extra: "FIRST" },
    { message: "SECOND", segment: "SECOND", path: "SECOND", extra: "SECOND" },
  );
  const eDrift = new RouterError("P1", ctorDrift.bag as never);

  const fieldsCount = countingBag({ userId: "u1", role: "admin" });
  const eF = new RouterError("P1");

  eF.setAdditionalFields(fieldsCount.bag as never);

  const fieldsDrift = driftingBag(
    { userId: "FIRST", role: "FIRST" },
    { userId: "SECOND", role: "SECOND" },
  );
  const eFd = new RouterError("P1");

  eFd.setAdditionalFields(fieldsDrift.bag as never);

  // setErrorInstance: three NAMED reads off an accessor-backed Error.
  const reads: Record<string, number> = { message: 0, cause: 0, stack: 0 };
  const nth: Record<string, number> = { message: 0, cause: 0, stack: 0 };
  const foreign = new Error("x");

  for (const k of ["message", "cause", "stack"] as const) {
    Object.defineProperty(foreign, k, {
      configurable: true,
      get: () => {
        reads[k] += 1;
        nth[k] += 1;

        return nth[k] === 1 ? "FIRST" : "SECOND";
      },
    });
  }

  const eE = new RouterError("P1");

  eE.setErrorInstance(foreign);

  out.p1 = {
    ctor: {
      reads: ctorCount.reads,
      landedFromFirstRead: {
        message: eDrift.message,
        segment: eDrift.segment,
        path: eDrift.path,
        extra: rd(eDrift, "extra"),
      },
      reachedBranch: rd(eCount, "extra") === 1,
    },
    setAdditionalFields: {
      reads: fieldsCount.reads,
      landedFromFirstRead: {
        userId: rd(eFd, "userId"),
        role: rd(eFd, "role"),
      },
      reachedBranch: rd(eF, "userId") === "u1",
    },
    setErrorInstance: {
      reads,
      landedFromFirstRead: {
        message: eE.message,
        cause: rd(eE, "cause"),
        stack: eE.stack,
      },
    },
  };
}

// ───────────────── P2 — a Proxy that lies about its own keys ────────────────
{
  const makeLiar = (): { bag: object; asked: string[] } => {
    const target: Record<string, unknown> = { honest: "HONEST" };
    const asked: string[] = [];

    const bag = new Proxy(target, {
      ownKeys: () => ["honest"], // "ghost" is deliberately NOT named
      getOwnPropertyDescriptor: (t, k) => {
        asked.push(String(k));

        if (k === "ghost") {
          return {
            value: "GHOST",
            enumerable: true,
            configurable: true,
            writable: true,
          };
        }

        return Reflect.getOwnPropertyDescriptor(t, k);
      },
      get: (t, k, r) =>
        k === "ghost" ? "GHOST" : (Reflect.get(t, k, r) as unknown),
    });

    return { bag, asked };
  };

  const liarA = makeLiar();
  const eA = new RouterError("P2", liarA.bag as never);

  const liarB = makeLiar();
  const eB = new RouterError("P2");

  eB.setAdditionalFields(liarB.bag as never);

  out.p2 = {
    ctor: {
      ghostLanded: Object.hasOwn(eA, "ghost"),
      honestLanded: rd(eA, "honest") === "HONEST", // positive control
      descriptorAskedFor: liarA.asked,
    },
    setAdditionalFields: {
      ghostLanded: Object.hasOwn(eB, "ghost"),
      honestLanded: rd(eB, "honest") === "HONEST",
      descriptorAskedFor: liarB.asked,
    },
    setErrorInstance:
      "n/a — no enumeration: three fixed names are read off the caller's Error",
  };
}

// ─────────── P3 — ambient accessor under the key name, and own __proto__ ────
{
  const p3 = (
    name: string,
    run: (e: RouterError) => void,
  ): Record<string, unknown> => {
    const seen: unknown[] = [];
    let threw: string | null = null;
    let readsBackWhileInstalled: unknown;
    const e = new RouterError("P3");

    Object.defineProperty(Object.prototype, name, {
      configurable: true,
      get: () => "HIJACKED",
      set: (v: unknown) => {
        seen.push(v);
      },
    });

    try {
      run(e);
      readsBackWhileInstalled = rd(e, name);
    } catch (error) {
      threw = String(error);
    } finally {
      delete (Object.prototype as Record<string, unknown>)[name];
    }

    return {
      ambientSetterCalls: seen.length,
      ownAfterWrite: Object.hasOwn(e, name),
      readsBackWhileInstalled,
      readsBackAfterRemoval: rd(e, name),
      threw,
    };
  };

  // getter-ONLY ambient accessor: [[Set]] throws in a module, define does not.
  const p3GetterOnly = (
    name: string,
    run: (e: RouterError) => void,
  ): Record<string, unknown> => {
    let threw: string | null = null;
    const e = new RouterError("P3");

    Object.defineProperty(Object.prototype, name, {
      configurable: true,
      get: () => "HIJACKED",
    });

    try {
      run(e);
    } catch (error) {
      threw = String(error);
    } finally {
      delete (Object.prototype as Record<string, unknown>)[name];
    }

    return { ownAfterWrite: Object.hasOwn(e, name), readsBackAs: rd(e, name), threw };
  };

  // POSITIVE CONTROL: clean chain, same code path.
  const cleanCtor = new RouterError("P3", { extra: "CLEAN" });
  const cleanFields = new RouterError("P3");

  cleanFields.setAdditionalFields({ extra: "CLEAN" });

  const cleanInstance = new RouterError("P3");
  const cleanSrc = new Error("clean");

  (cleanSrc as { cause?: unknown }).cause = "CLEAN";
  cleanInstance.setErrorInstance(cleanSrc);

  const polluted = JSON.parse(
    '{"__proto__":{"POLLUTED":true},"ok":1}',
  ) as Record<string, unknown>;
  const eProto = new RouterError("P3", polluted as never);
  const eProtoFields = new RouterError("P3");

  eProtoFields.setAdditionalFields(polluted);

  const srcForCause = new Error("src");

  Object.defineProperty(srcForCause, "cause", {
    configurable: true,
    enumerable: true,
    writable: true,
    value: "VALUE",
  });

  out.p3 = {
    control: {
      ctor: rd(cleanCtor, "extra"),
      setAdditionalFields: rd(cleanFields, "extra"),
      setErrorInstance: rd(cleanInstance, "cause"),
    },
    ctorAmbientAccessorDirect: (() => {
      const seen: unknown[] = [];
      let threw: string | null = null;
      let built: RouterError | null = null;

      Object.defineProperty(Object.prototype, "extra", {
        configurable: true,
        get: () => "HIJACKED",
        set: (v: unknown) => {
          seen.push(v);
        },
      });

      try {
        built = new RouterError("P3", { extra: "VALUE" });
      } catch (error) {
        threw = String(error);
      } finally {
        delete (Object.prototype as Record<string, unknown>).extra;
      }

      return {
        ambientSetterCalls: seen.length,
        ownAfterWrite: built ? Object.hasOwn(built, "extra") : null,
        readsBackAs: built ? rd(built, "extra") : null,
        threw,
      };
    })(),
    setAdditionalFieldsAmbientAccessor: p3("extra", (e) => {
      e.setAdditionalFields({ extra: "VALUE" });
    }),
    setErrorInstanceAmbientAccessor: p3("cause", (e) => {
      e.setErrorInstance(srcForCause);
    }),
    setErrorInstanceGetterOnly: p3GetterOnly("cause", (e) => {
      e.setErrorInstance(srcForCause);
    }),
    // Which of the three fields is exposed? `message` and `stack` are OWN on
    // every Error instance, so [[Set]] finds them and never consults the chain;
    // `cause` is own only when passed to the Error constructor, which
    // RouterError never does.
    setErrorInstanceOwnnessOfTargets: (() => {
      const e = new RouterError("P3");

      return {
        message: Object.hasOwn(e, "message"),
        stack: Object.hasOwn(e, "stack"),
        cause: Object.hasOwn(e, "cause"),
      };
    })(),
    setErrorInstanceAmbientMessage: p3("message", (e) => {
      e.setErrorInstance(srcForCause);
    }),
    setErrorInstanceAmbientStack: p3("stack", (e) => {
      e.setErrorInstance(srcForCause);
    }),
    setAdditionalFieldsGetterOnly: p3GetterOnly("extra", (e) => {
      e.setAdditionalFields({ extra: "VALUE" });
    }),
    ownProtoKey: {
      ctor: {
        instanceofIntact: eProto instanceof RouterError,
        protoIsRouterErrorPrototype:
          Object.getPrototypeOf(eProto) === RouterError.prototype,
        ownProtoKeyOnInstance: Object.hasOwn(eProto, "__proto__"),
        pollutedGlobally: ({} as Record<string, unknown>).POLLUTED === true,
        siblingKeyLanded: rd(eProto, "ok") === 1, // input reached the loop
        inJson: Object.hasOwn(eProto.toJSON(), "__proto__"),
      },
      setAdditionalFields: {
        instanceofIntact: eProtoFields instanceof RouterError,
        protoIsRouterErrorPrototype:
          Object.getPrototypeOf(eProtoFields) === RouterError.prototype,
        ownProtoKeyOnInstance: Object.hasOwn(eProtoFields, "__proto__"),
        siblingKeyLanded: rd(eProtoFields, "ok") === 1,
      },
    },
  };
}

// ───────── P4 — what freezes at the throw, and how deep (authority #1960) ───
async function p4(): Promise<void> {
  const nestedCallerContainer = { deep: { x: 1 } };
  const appLeaf = { svc: "LEAF" };

  const router = createRouter([
    { name: "home", path: "/home" },
    { name: "blocked", path: "/blocked" },
  ]);

  const appError = new RouterError("APP_THROWN", {
    ctx: nestedCallerContainer,
    svc: appLeaf,
  });

  getLifecycleApi(router).addActivateGuard("blocked", () => () => {
    throw appError;
  });

  await router.start("/home");

  let received: unknown;

  try {
    await router.navigate("blocked");
  } catch (error) {
    received = error;
  }

  const rec = received as RouterError;

  out.p4 = {
    freshlyConstructedIsFrozen: Object.isFrozen(new RouterError("X", { a: 1 })),
    appBuiltThrownErrorIsFrozen: Object.isFrozen(appError),
    receivedIsFrozen: Object.isFrozen(rec),
    receivedIsACopy: rec !== appError,
    nestedCallerContainerFrozen: Object.isFrozen(nestedCallerContainer),
    nestedLeafIdentityPreserved: rd(rec, "ctx") === nestedCallerContainer,
    svcLeafIdentityPreserved: rd(rec, "svc") === appLeaf,
    setAdditionalFieldsOnFrozenThrown: (() => {
      try {
        rec.setAdditionalFields({ note: "late" });

        return `no throw; landed=${String(Object.hasOwn(rec, "note"))}`;
      } catch (error) {
        return String(error);
      }
    })(),
    setErrorInstanceOnFrozenThrown: (() => {
      try {
        rec.setErrorInstance(new Error("late"));

        return "accepted";
      } catch (error) {
        return String(error);
      }
    })(),
  };

  router.dispose();
}

void p4().then(() => {
  console.log(JSON.stringify(out, null, 1));
});
