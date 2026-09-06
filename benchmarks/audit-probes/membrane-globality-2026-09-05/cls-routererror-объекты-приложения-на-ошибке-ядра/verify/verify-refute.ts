// Опровергатель: независимые атаки на вердикт классификатора по семейству RouterError.
import { RouterError } from "@real-router/core";

const out: Record<string, unknown> = {};

function ambient(name: string, run: () => void) {
  let calls = 0;
  let seen: unknown;
  Object.defineProperty(Object.prototype, name, {
    configurable: true,
    set(v: unknown) {
      calls++;
      seen = v;
    },
    get() {
      return "HIJACKED";
    },
  });
  let threw: string | null = null;
  try {
    run();
  } catch (e) {
    threw = String(e);
  }
  delete (Object.prototype as unknown as Record<string, unknown>)[name];
  return { calls, seen, threw };
}

// A. Позитивный контроль: механизм амбиентного сеттера в этой среде РАБОТАЕТ.
out.controlMechanism = (() => {
  const target: Record<string, unknown> = {};
  const r = ambient("zzProbe", () => {
    target.zzProbe = "V";
  });
  return { setterCalls: r.calls, ownAfterWrite: Object.hasOwn(target, "zzProbe") };
})();

// B. ctor с экзотическими именами в мешке (stack/cause/name) — попадают в putField.
out.ctorExoticKeys = (() => {
  const leaf = { svc: 1 };
  const err = new RouterError("X", { stack: "S", cause: leaf, name: "N" } as never);
  return {
    ownStack: Object.hasOwn(err, "stack"),
    stackValue: err.stack,
    ownCause: Object.hasOwn(err, "cause"),
    causeIsLeaf: (err as unknown as { cause: unknown }).cause === leaf,
    ownName: Object.hasOwn(err, "name"),
    nameValue: err.name,
    instanceofIntact: err instanceof RouterError,
  };
})();

// C. P3 setErrorInstance при УЖЕ собственном `cause` (пришёл мешком конструктора).
out.setErrorInstanceWithPriorOwnCause = (() => {
  const err = new RouterError("X", { cause: { pre: true } } as never);
  const src = new Error("src");
  (src as { cause?: unknown }).cause = { fresh: true };
  const r = ambient("cause", () => {
    err.setErrorInstance(src);
  });
  return {
    ambientSetterCalls: r.calls,
    ownAfterWrite: Object.hasOwn(err, "cause"),
    causeIsSrcLeaf:
      (err as unknown as { cause: unknown }).cause === (src as { cause?: unknown }).cause,
  };
})();

// D. Тот же вызов на чистой цепочке — репродукция вердикта «P3 нарушен».
out.setErrorInstanceCleanChain = (() => {
  const err = new RouterError("X");
  const src = new Error("src");
  (src as { cause?: unknown }).cause = { fresh: true };
  const r = ambient("cause", () => {
    err.setErrorInstance(src);
  });
  return {
    ambientSetterCalls: r.calls,
    ownAfterWrite: Object.hasOwn(err, "cause"),
    readsBack: (err as unknown as { cause: unknown }).cause,
  };
})();

// E. Удерживает ли ядро мешок вызывающего? Считаем чтения ПОСЛЕ кадра конструктора,
//    включая round-trip через toJSON/hasField/getField.
out.bagNotRetained = (() => {
  let readsAfterFrame = 0;
  let frameDone = false;
  const bag = new Proxy(
    { message: "m", segment: "s", path: "/p", extra: "e" } as Record<string, unknown>,
    {
      get(t, k, r) {
        if (frameDone) readsAfterFrame++;
        return Reflect.get(t, k, r);
      },
    },
  );
  const err = new RouterError("C", bag);
  frameDone = true;
  JSON.stringify(err);
  err.hasField("extra");
  err.getField("extra");
  return { readsAfterFrame, extra: err.getField("extra") };
})();

// F. То же для setAdditionalFields и setErrorInstance.
out.fieldsBagNotRetained = (() => {
  let readsAfterFrame = 0;
  let frameDone = false;
  const bag = new Proxy({ userId: "u1" } as Record<string, unknown>, {
    get(t, k, r) {
      if (frameDone) readsAfterFrame++;
      return Reflect.get(t, k, r);
    },
  });
  const err = new RouterError("C");
  err.setAdditionalFields(bag);
  frameDone = true;
  JSON.stringify(err);
  err.getField("userId");
  return { readsAfterFrame, userId: err.getField("userId") };
})();

out.errBagNotRetained = (() => {
  let readsAfterFrame = 0;
  let frameDone = false;
  const src = new Error("src");
  const proxied = new Proxy(src, {
    get(t, k, r) {
      if (frameDone) readsAfterFrame++;
      return Reflect.get(t, k, r);
    },
  });
  const err = new RouterError("C");
  err.setErrorInstance(proxied);
  frameDone = true;
  JSON.stringify(err);
  void err.message;
  void err.stack;
  return { readsAfterFrame, message: err.message };
})();

console.log(JSON.stringify(out, null, 1));
