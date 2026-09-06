// ЦЕНА (а) на двери createSsrLoaderPlugin·SsrLoaderFn·return.
// Форма мешка — реальная: defer-payload из двух полей (critical + deferred),
// deferred на 1-2 ключа (форма ssr-data-plugin / rsc-server-plugin).
// Арм A (baseline) — форма ШИПНУТОГО writeLoaderResult: isDeferred(value) дважды,
// value.deferred дважды, value.critical один раз.
// Арм B (copy) — (а): один isDeferred, ОДИН снапшот полей payload-а на границе.
// Арм A/A — тот же baseline вторым именем (пол шума).
import { bench, run, summary } from "mitata";

const BRAND: unique symbol = Symbol.for(
  "@real-router/ssr-data-plugin/defer",
) as never;

function isDeferred(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === "object" &&
    Object.hasOwn(value, BRAND) &&
    (value as Record<symbol, unknown>)[BRAND] === true
  );
}

const sink: Record<string, unknown> = {};

function put(target: Record<string, unknown>, key: string, value: unknown): void {
  if (key in target && !Object.hasOwn(target, key)) {
    Object.defineProperty(target, key, {
      value,
      writable: true,
      enumerable: true,
      configurable: true,
    });

    return;
  }

  target[key] = value;
}

const payload = Object.freeze({
  critical: { user: { id: 1 } },
  deferred: Object.freeze({ posts: Promise.resolve([1, 2]) }),
  [BRAND]: true,
}) as unknown as {
  critical: unknown;
  deferred: Record<string, unknown>;
};

function armBaseline(): void {
  const value = payload;

  if (isDeferred(value) && false) {
    return;
  }

  if (isDeferred(value)) {
    const deferred: unknown = value.deferred;

    if (typeof deferred !== "object" || deferred === null) {
      return;
    }

    const keys = Object.keys(deferred);

    put(sink, "data", value.critical);
    put(sink, "dataDeferred", value.deferred);
    put(sink, "dataDeferredKeys", keys);
  }
}

function armCopy(): void {
  const value = payload;

  if (!isDeferred(value)) {
    return;
  }

  // (а): контейнер payload-а снят ОДИН раз на границе; дальше объекта вызывающего
  // не касаемся (листья — critical / deferred — по ссылке).
  const snapshot = { critical: value.critical, deferred: value.deferred };

  if (typeof snapshot.deferred !== "object" || snapshot.deferred === null) {
    return;
  }

  const keys = Object.keys(snapshot.deferred);

  put(sink, "data", snapshot.critical);
  put(sink, "dataDeferred", snapshot.deferred);
  put(sink, "dataDeferredKeys", keys);
}

summary(() => {
  bench("A · baseline (shipped shape)", armBaseline).gc("inner");
  bench("B · copy-at-boundary (а)", armCopy).gc("inner");
  bench("A2 · baseline again (A/A floor)", armBaseline).gc("inner");
});

void run();
