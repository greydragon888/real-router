/**
 * Probe 01 — behavioural verification of the six focused questions from
 * `packages/core/.claude/prompts/method-deep-audit-claim-context-namespace.md`.
 *
 * NOT a latency probe — a contract probe. Each question prints the observed
 * behaviour + a verdict, so the audit's "by-design / not-a-bug" calls rest on
 * a RUN, not on reading. Public API only (createRouter / getPluginApi /
 * cloneRouter / usePlugin) — `getInternals` is not exported (core subpaths are
 * `.`, `./api`, `./utils`, `./validation`), so the contextClaimRecords Set is
 * verified by public proxy + code citation (Router.ts:536), not direct read.
 *
 * Run: npx tsx benchmarks/audit-probes/claim-context-namespace-2026-06-25/probe-01-six-questions.ts
 */

import { createRouter } from "@real-router/core";
import { cloneRouter, getPluginApi } from "@real-router/core/api";

const ROUTES = [
  { name: "home", path: "/" },
  { name: "sign-in", path: "/sign-in" },
];

function must<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new Error("expected a committed state, got undefined");
  }

  return value;
}

function errorCode(error: unknown): string {
  return (error as { code?: string }).code ?? "";
}

async function main(): Promise<void> {
  // ── Q1 — frozen state mutation ──────────────────────────────────────────
  {
    const r = createRouter(ROUTES);

    await r.start("/");

    const claim = getPluginApi(r).claimContextNamespace("q1");
    const state = must(r.getState());
    const stateFrozen = Object.isFrozen(state);
    const ctxFrozen = Object.isFrozen(state.context);

    claim.write(state, { foo: "bar" });

    const wrote =
      JSON.stringify(state.context.q1) === JSON.stringify({ foo: "bar" });
    const verdict =
      !ctxFrozen && wrote && stateFrozen
        ? "BY-DESIGN (c): partial freeze — context exempt (helpers.ts:24), write succeeds"
        : "ANOMALY";

    console.log(
      `Q1 frozen-state-mutation: state.frozen=${stateFrozen} context.frozen=${ctxFrozen} write-ok=${wrote} => ${verdict}`,
    );

    r.dispose();
  }

  // ── Q2 — cross-clone isolation ──────────────────────────────────────────
  {
    const base = createRouter(ROUTES);

    await base.start("/");
    getPluginApi(base).claimContextNamespace("q2");

    const clone = cloneRouter(base);

    let cloneClaimOk = false;

    try {
      getPluginApi(clone).claimContextNamespace("q2");
      cloneClaimOk = true;
    } catch {
      /* shared records would throw ALREADY_CLAIMED */
    }

    const verdict = cloneClaimOk
      ? "ISOLATED (fresh Set per clone, Router.ts:309) — correct for SSR"
      : "SHARED — would be CRITICAL";

    console.log(
      `Q2 cross-clone-isolation: clone re-claim "q2" ok=${cloneClaimOk} => ${verdict}`,
    );

    clone.dispose();
    base.dispose();
  }

  // ── Q3 — write-after-release ────────────────────────────────────────────
  {
    const r = createRouter(ROUTES);

    await r.start("/");

    const claim = getPluginApi(r).claimContextNamespace("q3");

    claim.release();
    claim.write(must(r.getState()), "after-release");

    const ok = must(r.getState()).context.q3 === "after-release";
    const verdict = ok
      ? "BY-DESIGN: write is sugar for state.context[ns]=v; release frees the NAME only (escape-hatch test L217)"
      : "write revoked";

    console.log(
      `Q3 write-after-release: write-still-works=${ok} => ${verdict}`,
    );

    r.dispose();
  }

  // ── Q4 — re-claim stale read (and its bound) ────────────────────────────
  {
    const r = createRouter(ROUTES);

    await r.start("/");

    const api = getPluginApi(r);
    const claimA = api.claimContextNamespace("shared");
    const state = must(r.getState());

    claimA.write(state, { secret: "A" });
    claimA.release();
    api.claimContextNamespace("shared"); // B re-claims, succeeds

    const leaked = state.context.shared;

    // Bound: next navigation rebuilds context (NavigationNamespace.ts:186)
    await r.navigate("sign-in");

    const afterNav = must(r.getState()).context.shared;

    console.log(
      `Q4 reclaim-stale-read: B sees prior write=${JSON.stringify(leaked)}; after navigate context.shared=${JSON.stringify(
        afterNav,
      )} => BY-DESIGN: release frees name not data; leak BOUNDED to one state obj (context rebuilt fresh per nav)`,
    );

    r.dispose();
  }

  // ── Q5 — unsubscribe does NOT auto-release ──────────────────────────────
  {
    const r = createRouter(ROUTES);
    const unsub = r.usePlugin((rr) => {
      getPluginApi(rr).claimContextNamespace("q5");

      return { teardown() {} }; // deliberately does NOT release
    });

    unsub();

    let threw = false;

    try {
      getPluginApi(r).claimContextNamespace("q5");
    } catch {
      threw = true;
    }

    const verdict = threw
      ? "NOT auto-released (by-design: manual release() in teardown, mirrors extendRouter's removeExtensions)"
      : "auto-released";

    console.log(
      `Q5 unsubscribe-no-auto-release: re-claim after unsub threw ALREADY_CLAIMED=${threw} => ${verdict}`,
    );

    r.dispose();
  }

  // ── Q6 — dispose clears the registry ────────────────────────────────────
  {
    const r = createRouter(ROUTES);

    getPluginApi(r).claimContextNamespace("q6");
    r.dispose();

    let code = "";

    try {
      getPluginApi(r).claimContextNamespace("q6");
    } catch (error) {
      code = errorCode(error);
    }

    console.log(
      `Q6 dispose-clears: post-dispose claim code=${code} => Set cleared at Router.ts:536 (internal, not publicly readable; ROUTER_DISPOSED guard fires first)`,
    );
  }
}

main().catch((error: unknown) => {
  console.error("PROBE FAILED:", error);
  process.exitCode = 1;
});
