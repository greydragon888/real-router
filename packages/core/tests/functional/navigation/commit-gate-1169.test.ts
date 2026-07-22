import { describe, it, expect, vi } from "vitest";

import { errorCodes, events } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

import { createTestRouter } from "../../helpers";

const codeOf = (error: unknown): string | undefined =>
  (error as { code?: string }).code;

/**
 * #1169 navigation commit-gate + #1197 + #1186 — regression set.
 *
 * A synchronous `stop()`/`dispose()`/external-`opts.signal` abort from inside a
 * transition listener (`subscribeLeave`, plugin `onTransitionStart`) must cancel
 * the in-flight navigation, not commit it. The FSM table (D-full: `send()` not
 * `forceState`) prevents the resurrection; the pre-commit gate prevents the
 * `setState`. Mirrors `benchmarks/audit-probes/navigate-2026-07-03/probe-02`.
 */
describe("commit-gate #1169 — stop/dispose/abort from a transition listener", () => {
  it("QA: stop() from a sync subscribeLeave cancels (no commit, router stopped)", async () => {
    const router = createTestRouter();

    await router.start("/home");

    router.subscribeLeave(() => {
      router.stop();
    });

    const outcome = await router.navigate("items", { id: "1" }).then(
      (s) => ({ code: undefined, name: s.name }),
      (error: unknown) => ({ code: codeOf(error), name: undefined }),
    );

    expect(outcome.code).toBe(errorCodes.TRANSITION_CANCELLED);
    expect(router.isActive()).toBe(false);
  });

  it("QB: dispose() from a sync subscribeLeave cancels (no commit)", async () => {
    const router = createTestRouter();

    await router.start("/home");

    router.subscribeLeave(() => {
      router.dispose();
    });

    const code = await router.navigate("items", { id: "1" }).then(
      () => undefined,
      (error: unknown) => codeOf(error),
    );

    expect(code).toBe(errorCodes.TRANSITION_CANCELLED);
    expect(router.isActive()).toBe(false);
  });

  it("QD: external opts.signal abort from a sync subscribeLeave cancels", async () => {
    const router = createTestRouter();

    await router.start("/home");

    const controller = new AbortController();

    router.subscribeLeave(() => {
      controller.abort();
    });

    const code = await router
      .navigate("items", { id: "1" }, undefined, { signal: controller.signal })
      .then(
        () => undefined,
        (error: unknown) => codeOf(error),
      );

    expect(code).toBe(errorCodes.TRANSITION_CANCELLED);
    // Router stays live — an external abort cancels the navigation, not the router.
    expect(router.isActive()).toBe(true);
  });

  it("QE: stop() from a plugin onTransitionStart cancels (no resurrection)", async () => {
    const router = createTestRouter();

    await router.start("/home");

    router.usePlugin(() => ({
      onTransitionStart: () => {
        router.stop();
      },
    }));

    const code = await router.navigate("items", { id: "1" }).then(
      () => undefined,
      (error: unknown) => codeOf(error),
    );

    expect(code).toBe(errorCodes.TRANSITION_CANCELLED);
    expect(router.isActive()).toBe(false);
  });

  it("QF: dispose() from a plugin onTransitionStart cancels (no zombie router)", async () => {
    const router = createTestRouter();

    await router.start("/home");

    router.usePlugin(() => ({
      onTransitionStart: () => {
        router.dispose();
      },
    }));

    const code = await router.navigate("items", { id: "1" }).then(
      () => undefined,
      (error: unknown) => codeOf(error),
    );

    expect(code).toBe(errorCodes.TRANSITION_CANCELLED);
    expect(router.isActive()).toBe(false);
  });

  it("QG: stop() from a plugin onTransitionLeaveApprove cancels (pre-commit window)", async () => {
    const router = createTestRouter();

    await router.start("/home");

    // onTransitionLeaveApprove is a pre-commit window too — the suspendable
    // snapshot must cover it (not just onTransitionStart / subscribeLeave),
    // else the cancel misclassifies (NOT_STARTED instead of CANCELLED).
    router.usePlugin(() => ({
      onTransitionLeaveApprove: () => {
        router.stop();
      },
    }));

    const code = await router.navigate("items", { id: "1" }).then(
      () => undefined,
      (error: unknown) => codeOf(error),
    );

    expect(code).toBe(errorCodes.TRANSITION_CANCELLED);
    expect(router.isActive()).toBe(false);
  });

  it("emits no TRANSITION_SUCCESS after TRANSITION_CANCEL (clean event stream)", async () => {
    const router = createTestRouter();

    await router.start("/home");

    const seen: string[] = [];
    const api = getPluginApi(router);

    api.addEventListener(events.TRANSITION_SUCCESS, () => seen.push("SUCCESS"));
    api.addEventListener(events.TRANSITION_CANCEL, () => seen.push("CANCEL"));

    router.subscribeLeave(() => {
      router.stop();
    });

    await router.navigate("items", { id: "1" }).catch(() => {});

    expect(seen).toContain("CANCEL");
    expect(seen).not.toContain("SUCCESS");
  });
});

describe("#1197 — external abort during async subscribeLeave canonicalizes", () => {
  it("rejects RouterError(TRANSITION_CANCELLED), not the raw reason, with no spurious error", async () => {
    const router = createTestRouter();

    await router.start("/home");

    const onError = vi.fn();

    getPluginApi(router).addEventListener(events.TRANSITION_ERROR, onError);

    // Async leave parks the pipeline; the external signal aborts while parked.
    router.subscribeLeave(
      () => new Promise<void>((resolve) => setTimeout(resolve, 50)),
    );

    const controller = new AbortController();
    const nav = router.navigate("items", { id: "1" }, undefined, {
      signal: controller.signal,
    });

    await new Promise((r) => setTimeout(r, 5));
    controller.abort(new Error("user-cancelled"));

    const code = await nav.then(
      () => undefined,
      (error: unknown) => codeOf(error),
    );

    expect(code).toBe(errorCodes.TRANSITION_CANCELLED);
    // No spurious TRANSITION_ERROR after the cancel (guard-path parity).
    expect(onError).not.toHaveBeenCalled();
  });

  it("threads an internal cancel (RouterError) through unchanged (#943 reason preserved)", async () => {
    const router = createTestRouter();

    await router.start("/home");

    // Async leave parks; a second navigate supersedes → internal cancel whose
    // reason is already a RouterError(TRANSITION_CANCELLED) — passed through.
    router.subscribeLeave(
      () => new Promise<void>((resolve) => setTimeout(resolve, 50)),
    );

    const first = router.navigate("items", { id: "1" });

    await new Promise((r) => setTimeout(r, 5));
    const second = router.navigate("index");

    const code = await first.then(
      () => undefined,
      (error: unknown) => codeOf(error),
    );

    expect(code).toBe(errorCodes.TRANSITION_CANCELLED);

    await second;
  });
});

describe("#1186 — navigateToNotFound liveness gate", () => {
  it("dispose() while a start-interceptor is parked rejects start() with no committed state", async () => {
    const router = createTestRouter();

    let release!: () => void;
    const parked = new Promise<void>((resolve) => {
      release = resolve;
    });

    getPluginApi(router).addInterceptor("start", async (next, path) => {
      await parked; // park the start pipeline in the interceptor window

      return next(path);
    });

    const startPromise = router.start("/home");

    await new Promise((r) => setTimeout(r, 5));

    // Dispose lands while the interceptor is parked (FSM already DISPOSED). When
    // the interceptor resumes, matchPath misses the cleared tree and the default
    // allowNotFound path would commit UNKNOWN_ROUTE on the disposed router.
    router.dispose();
    release();

    const outcome = await startPromise.then(
      () => "resolved",
      (error: unknown) => codeOf(error),
    );

    expect(outcome).not.toBe("resolved");
    expect(router.isActive()).toBe(false);
    // No phantom state committed on the disposed router.
    expect(router.getState()).toBeUndefined();
  });
});
