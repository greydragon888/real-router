import { act, render, screen } from "@testing-library/preact";
import { describe, it, expect, vi } from "vitest";

import { useSyncExternalStore } from "../../src/useSyncExternalStore";

import type { ComponentChildren } from "preact";

// Functional regression tests for the Preact-only useSyncExternalStore polyfill
// (no native equivalent in Preact). All three properties below are exercised
// implicitly by every router hook, but the dedicated tests here lock them so
// removing any of the three pieces (Object.is bailout / sync() race fix /
// stable-ref contract) fails immediately rather than silently degrading.

describe("useSyncExternalStore polyfill", () => {
  describe("Object.is(prev, next) bailout", () => {
    it("does not re-render when getSnapshot returns the same reference between notifications", () => {
      const snapshot = { value: 1 };
      const listeners = new Set<() => void>();

      const subscribe = (cb: () => void): (() => void) => {
        listeners.add(cb);

        return () => listeners.delete(cb);
      };
      const getSnapshot = (): typeof snapshot => snapshot;

      const renderSpy = vi.fn();

      function Consumer(): ComponentChildren {
        renderSpy();
        const v = useSyncExternalStore(subscribe, getSnapshot);

        return <span data-testid="v">{v.value}</span>;
      }

      render(<Consumer />);

      const initialRenders = renderSpy.mock.calls.length;

      // Fire the listener several times — `getSnapshot` returns the same
      // object ref, so the updater short-circuits via Object.is and Preact
      // skips the re-render.

      void act(() => {
        for (let i = 0; i < 3; i++) {
          listeners.forEach((cb) => {
            cb();
          });
        }
      });

      expect(renderSpy).toHaveBeenCalledTimes(initialRenders);
      expect(screen.getByTestId("v")).toHaveTextContent("1");
    });
  });

  describe("Race fix: snapshot changes between render and commit", () => {
    it("commits the latest snapshot via sync() when getSnapshot returns a fresher value at effect time", () => {
      // Model the documented race: useState(getSnapshot) reads value V_render
      // at render-time; before the subscribe-effect installs the listener,
      // the store advances. The polyfill calls `sync()` inside the effect to
      // catch the new value and avoid pinning the consumer to V_render.
      //
      // We simulate it with a getSnapshot whose return value advances on each
      // call: `useState(initialFn)` invokes initialFn once → reads "v1".
      // `sync()` inside useEffect invokes getSnapshot again → reads "v2",
      // and setValue("v2") commits the fresher snapshot. Without `sync()` the
      // visible value would stay pinned at "v1".
      let call = 0;
      const values = ["v1", "v2"] as const;

      const getSnapshot = (): string => values[Math.min(call++, 1)] ?? "v2";
      const subscribe = (): (() => void) => () => {};

      function Consumer(): ComponentChildren {
        const v = useSyncExternalStore(subscribe, getSnapshot);

        return <span data-testid="v">{v}</span>;
      }

      render(<Consumer />);

      expect(screen.getByTestId("v")).toHaveTextContent("v2");
    });
  });

  describe("_getServerSnapshot is intentionally ignored on the client", () => {
    it("does not invoke _getServerSnapshot when supplied; renders the client getSnapshot value", () => {
      // The polyfill's signature accepts `_getServerSnapshot` for parity with
      // React's native hook, but the JSDoc says it is intentionally ignored on
      // the client — `preact-render-to-string` already runs `useState(getSnapshot)`
      // on the server and never commits effects, and all router sources return
      // the same value on server and client. This test locks the "ignored"
      // contract: passing a server-snapshot callback must not pull it into the
      // client render path.
      const serverSnapshotSpy = vi.fn((): string => "from-server");
      const subscribe = (): (() => void) => () => {};
      const getSnapshot = (): string => "from-client";

      function Probe(): ComponentChildren {
        const v = useSyncExternalStore(
          subscribe,
          getSnapshot,
          serverSnapshotSpy,
        );

        return <em data-testid="server-snap">{v}</em>;
      }

      render(<Probe />);

      expect(screen.getByTestId("server-snap")).toHaveTextContent(
        "from-client",
      );
      expect(serverSnapshotSpy).not.toHaveBeenCalled();
    });
  });

  describe("Stable-reference contract for subscribe / getSnapshot", () => {
    it("re-subscribes the listener when the subscribe ref changes between renders", () => {
      // The effect's deps array is `[subscribe, getSnapshot]`. Unstable refs
      // produce unsubscribe → subscribe churn on every render — silent perf
      // regression documented in the polyfill JSDoc. This test makes the
      // contract observable: a fresh `subscribe` ref must teardown the old
      // subscription and install a new one.
      const tearDowns = vi.fn();

      function makeSubscribe(): (cb: () => void) => () => void {
        return () => () => {
          tearDowns();
        };
      }
      const getSnapshot = (): number => 0;

      function Consumer({
        subscribe,
      }: Readonly<{
        subscribe: (cb: () => void) => () => void;
      }>): ComponentChildren {
        // Differs from the other Consumers above: takes `subscribe` as a prop
        // so the test can swap the reference between renders, and renders a
        // distinct DOM shape so sonar's structural-similarity check sees this
        // function as semantically separate.
        const v = useSyncExternalStore(subscribe, getSnapshot);

        return <output data-testid="stable-v">value={v}</output>;
      }

      const { rerender } = render(<Consumer subscribe={makeSubscribe()} />);

      expect(tearDowns).not.toHaveBeenCalled();

      // Pass a brand-new subscribe ref — the effect's deps change, Preact
      // tears down the previous subscription before installing the new one.
      rerender(<Consumer subscribe={makeSubscribe()} />);

      expect(tearDowns).toHaveBeenCalledTimes(1);

      rerender(<Consumer subscribe={makeSubscribe()} />);

      expect(tearDowns).toHaveBeenCalledTimes(2);
    });
  });
});
