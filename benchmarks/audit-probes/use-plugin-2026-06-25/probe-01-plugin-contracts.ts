/**
 * Probe 01 — behavioural verification for the usePlugin + extendRouter +
 * addInterceptor deep-audit (method-deep-audit-use-plugin.md).
 *
 * Contract probe (NOT latency — machine on battery, mitata latency probes are
 * [SKIPPED: battery]). Public API only. Each line: observation + verdict, so
 * the audit's by-design/test-gap calls rest on a RUN, not on reading.
 *
 * Run: npx tsx benchmarks/audit-probes/use-plugin-2026-06-25/probe-01-plugin-contracts.ts
 */

import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

const ROUTES = [
  { name: "home", path: "/" },
  { name: "about", path: "/about" },
  { name: "user", path: "/users/:id" },
];

function errorCode(error: unknown): string {
  return (error as { code?: string }).code ?? String(error);
}

function classifyTeardownOrder(seq: string): string {
  if (seq === "A,B,C") {
    return "FIFO / REGISTRATION order (prompt assumes LIFO — wrong)";
  }

  if (seq === "C,B,A") {
    return "LIFO";
  }

  return `unexpected(${seq})`;
}

// P1 — teardown runs in registration order; a throwing teardown is non-blocking.
function p1TeardownOrder(): void {
  const r = createRouter(ROUTES);
  const order: string[] = [];

  r.usePlugin(() => ({
    teardown() {
      order.push("A");
    },
  }));
  r.usePlugin(() => ({
    teardown() {
      order.push("B");

      throw new Error("B teardown fails");
    },
  }));
  r.usePlugin(() => ({
    teardown() {
      order.push("C");
    },
  }));

  r.dispose(); // disposeAll → each unsubscribe → cleanup → teardown

  const seq = order.join(",");

  console.log(
    `P1 teardown-order: [${seq}] C-ran-despite-B-throw=${order.includes("C")} => ${classifyTeardownOrder(seq)}; B-throw non-blocking`,
  );
}

// P2 — interceptors execute LIFO (last-registered is outermost).
function p2InterceptorOrder(): void {
  const r = createRouter(ROUTES);
  const api = getPluginApi(r);
  const calls: string[] = [];

  api.addInterceptor("buildPath", (next, route, params) => {
    calls.push("i1");

    return next(route, params);
  });
  api.addInterceptor("buildPath", (next, route, params) => {
    calls.push("i2");

    return next(route, params);
  });
  r.buildPath("about");

  const verdict =
    calls.join(",") === "i2,i1"
      ? "LIFO (last-registered outermost) — distinct from teardown FIFO"
      : "other";

  console.log(`P2 interceptor-exec-order: [${calls.join(",")}] => ${verdict}`);
  r.dispose();
}

// P3 — addInterceptor on an unknown method is a silent no-op.
function p3UnknownInterceptorMethod(): void {
  const r = createRouter(ROUTES);
  const api = getPluginApi(r);
  const hit = { called: false };
  let caught: unknown;

  try {
    api.addInterceptor(
      "bogusMethod" as never,
      (() => {
        hit.called = true;
      }) as never,
    );
  } catch (error) {
    caught = error;
  }

  r.buildPath("about"); // nothing wraps bogusMethod

  const threw = caught !== undefined;
  const verdict =
    !threw && !hit.called
      ? "SILENT NO-OP (registered into Map, never wrapped/invoked — no method validation in core)"
      : "other";

  console.log(
    `P3 addInterceptor-unknown-method: threw=${threw} interceptor-ever-called=${hit.called} => ${verdict}`,
  );
  r.dispose();
}

// P4 — extendRouter is atomic: a conflict on any key assigns none.
function p4ExtendAtomicity(): void {
  const r = createRouter(ROUTES);
  const api = getPluginApi(r);
  let caught: unknown;

  try {
    api.extendRouter({ freshKey123: () => 1, navigate: () => 2 });
  } catch (error) {
    caught = error;
  }

  const code = caught === undefined ? "" : errorCode(caught);
  const freshAssigned = "freshKey123" in r;
  const verdict =
    code === "PLUGIN_CONFLICT" && !freshAssigned
      ? "ATOMIC (conflict on 'navigate' → 'freshKey123' NOT assigned)"
      : "NON-ATOMIC";

  console.log(
    `P4 extendRouter-atomicity: code=${code} freshKey-assigned=${freshAssigned} => ${verdict}`,
  );
  r.dispose();
}

// P5 — prototype-pollution keys are rejected (they are `in` every object).
function p5ProtoPollution(): void {
  const r = createRouter(ROUTES);
  const api = getPluginApi(r);
  const results: [string, string][] = []; // array, NOT object — "__proto__" as an object key is swallowed

  for (const key of ["__proto__", "constructor", "toString"]) {
    let caught: unknown;

    try {
      api.extendRouter({ [key]: () => 1 });
    } catch (error) {
      caught = error;
    }

    results.push([
      key,
      caught === undefined ? "ASSIGNED(!)" : errorCode(caught),
    ]);
  }

  const polluted = ({} as Record<string, unknown>).polluted;
  const allBlocked = results.every(([, code]) => code === "PLUGIN_CONFLICT");
  const shown = results.map(([k, c]) => `${k}=${c}`).join(" ");
  const verdict = allBlocked
    ? "BLOCKED via conflict-detection ('key in router' true for proto keys)"
    : "GAP";

  console.log(
    `P5 extendRouter-proto-pollution: ${shown} Object.prototype.polluted=${String(polluted)} => ${verdict}`,
  );
  r.dispose();
}

// P6 — usePlugin silently skips every falsy value.
function p6UsePluginFalsy(): void {
  const r = createRouter(ROUTES);
  let caught: unknown;

  try {
    r.usePlugin(0 as never);
    r.usePlugin("" as never);
    r.usePlugin(false, null, undefined);
  } catch (error) {
    caught = error;
  }

  const threw = caught !== undefined;

  console.log(
    `P6 usePlugin-falsy(0,'',false,null,undefined): threw=${threw} => ${
      threw ? "throws" : "SILENT SKIP (facade .filter(Boolean), Router.ts:598)"
    }`,
  );
  r.dispose();
}

// P7 — an interceptor that does not call next() short-circuits the chain.
function p7InterceptorHalt(): void {
  const r = createRouter(ROUTES);
  const api = getPluginApi(r);

  api.addInterceptor("buildPath", () => "HALTED");

  const result = r.buildPath("about");
  const verdict =
    result === "HALTED"
      ? "BY-DESIGN: interceptor short-circuits; original buildPath not called"
      : "other";

  console.log(
    `P7 interceptor-halt-no-next: buildPath('about')=${JSON.stringify(result)} => ${verdict}`,
  );
  r.dispose();
}

// P8 — a plugin registered after start() never receives onStart.
async function p8PluginAfterStart(): Promise<void> {
  const r = createRouter(ROUTES);

  await r.start("/");

  const fired = { hit: false };

  r.usePlugin(() => ({
    onStart() {
      fired.hit = true;
    },
  }));

  console.log(
    `P8 plugin-after-start-onStart: fired=${fired.hit} => ${
      fired.hit
        ? "fired"
        : "BY-DESIGN: onStart NOT fired (registered after start; gotcha holds)"
    }`,
  );
  r.dispose();
}

async function main(): Promise<void> {
  p1TeardownOrder();
  p2InterceptorOrder();
  p3UnknownInterceptorMethod();
  p4ExtendAtomicity();
  p5ProtoPollution();
  p6UsePluginFalsy();
  p7InterceptorHalt();
  await p8PluginAfterStart();
}

main().catch((error: unknown) => {
  console.error("PROBE FAILED:", error);
  process.exitCode = 1;
});
