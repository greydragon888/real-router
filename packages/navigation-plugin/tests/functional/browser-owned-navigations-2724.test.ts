import { createRouter, errorCodes, UNKNOWN_ROUTE } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { navigationPluginFactory } from "../../src";
import { MockNavigation } from "../helpers/mockNavigation";
import {
  createMockNavigationBrowser,
  routerConfig,
} from "../helpers/testUtils";

import type { Router, RouterError } from "@real-router/core";

// Lets a handler the plugin may have attached run before the test reads state.
const tick = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

/**
 * Which `navigate` events the router takes over (#2724). A download, a POST
 * form submission, a document reload, and a navigation that loads a new
 * document for a URL with no route are the browser's; the router takes the
 * rest. browser-plugin listens to `popstate` only, so it never sees the first
 * group at all.
 */
describe.each([{ allowNotFound: true }, { allowNotFound: false }])(
  "navigate events, allowNotFound: $allowNotFound (#2724)",
  ({ allowNotFound }) => {
    let mockNav: MockNavigation;
    let router: Router;
    let events: NavigateEvent[];

    // What a same-document navigation the router took ends in: the committed
    // route, or the code it was refused with.
    const outcome = (finished: Promise<unknown>): Promise<unknown> =>
      finished.then(
        () => router.getState()?.name,
        (error: unknown) => (error as RouterError).code,
      );

    beforeEach(async () => {
      mockNav = new MockNavigation("http://localhost/home");
      router = createRouter(routerConfig, {
        defaultRoute: "home",
        allowNotFound,
      });
      router.usePlugin(
        navigationPluginFactory({}, createMockNavigationBrowser(mockNav)),
      );
      await router.start();
      events = [];
      mockNav.addEventListener("navigate", (event: NavigateEvent) => {
        events.push(event);
      });
    });

    afterEach(() => {
      router.stop();
    });

    describe("left to the browser", () => {
      // Every row first proves its event could have been intercepted, so the
      // decline is the handler's choice, not the `canIntercept` early return.
      it("a navigation that loads a new document for a URL with no route", async () => {
        mockNav.navigate("http://localhost/orders/15/");
        await tick();

        expect(events.at(-1)?.canIntercept).toBe(true);
        expect(mockNav.crossDocumentNavigations).toStrictEqual([
          "http://localhost/orders/15/",
        ]);
        expect(router.getState()?.name).toBe("home");
      });

      it.each(["/users/list", "/accounts/logout/"])(
        "a POST form submission to %s",
        async (path) => {
          mockNav.submitForm(`http://localhost${path}`, new FormData());
          await tick();

          expect(events.at(-1)?.canIntercept).toBe(true);
          expect(mockNav.crossDocumentNavigations).toStrictEqual([
            `http://localhost${path}`,
          ]);
          expect(router.getState()?.name).toBe("home");
        },
      );

      // `<a download>` with no value: the attribute is the empty string.
      it.each(["/users/list", "/files/report.txt"])(
        "a download of %s, which keeps the document and its URL",
        async (path) => {
          mockNav.download(`http://localhost${path}`);
          await tick();

          expect(events).toHaveLength(1);
          expect(events[0].canIntercept).toBe(true);
          expect(mockNav.downloads).toStrictEqual([`http://localhost${path}`]);
          expect(mockNav.crossDocumentNavigations).toStrictEqual([]);
          expect(mockNav.currentUrl).toBe("http://localhost/home");
          expect(router.getState()?.name).toBe("home");
        },
      );

      it("a reload of a URL with a route", async () => {
        mockNav.reload();
        await tick();

        expect(events.at(-1)?.canIntercept).toBe(true);
        expect(mockNav.crossDocumentNavigations).toStrictEqual([
          "http://localhost/home",
        ]);
        expect(mockNav.entries()).toHaveLength(1);
      });

      // The document can outlive a navigation it left to the browser — a
      // download, or a response the server sends as an attachment — so the
      // router's next transition must describe itself, not that navigation.
      it.each([
        [
          "a download from a URL with a route",
          (nav: MockNavigation) => {
            nav.download("http://localhost/users/view/7");
          },
        ],
        [
          "a navigation to a URL with no route",
          (nav: MockNavigation) => {
            nav.navigate("http://localhost/export.csv", { info: "export" });
          },
        ],
        [
          "a POST form submission to a URL with a route",
          (nav: MockNavigation) => {
            nav.submitForm("http://localhost/users/view/7", new FormData());
          },
        ],
        [
          "a reload",
          (nav: MockNavigation) => {
            nav.reload();
          },
        ],
      ])(
        "without staging the metadata of %s for the router's next transition",
        async (_, leave) => {
          await router.navigate("users.list");
          const control = router.getState()?.context.navigation;

          await router.navigate("home");

          leave(mockNav);
          await router.navigate("users.list");

          expect(control).toBeDefined();
          expect(router.getState()?.name).toBe("users.list");
          expect(router.getState()?.context.navigation).toStrictEqual(control);
        },
      );
    });

    describe("taken by the router", () => {
      it("a navigation that loads a new document for a URL with a route", async () => {
        const { finished } = mockNav.navigate("http://localhost/users/list");

        expect(mockNav.crossDocumentNavigations).toStrictEqual([]);

        await finished;

        expect(router.getState()?.name).toBe("users.list");
      });

      it("a same-document navigation to a URL with no route", async () => {
        const result = await outcome(
          mockNav.historyPushState("http://localhost/orders/unknown").finished,
        );

        expect(result).toBe(
          allowNotFound ? UNKNOWN_ROUTE : errorCodes.ROUTE_NOT_FOUND,
        );
      });

      // Under strict mode the push to the page with no route is refused and
      // the browser returns from it (#2740): the router never stands on that
      // page here.
      it.runIf(allowNotFound)(
        "a fragment navigation on a page with no route",
        async () => {
          await mockNav.historyPushState("http://localhost/orders/unknown")
            .finished;

          const result = await outcome(
            mockNav.navigate("http://localhost/orders/unknown#details")
              .finished,
          );

          expect(mockNav.crossDocumentNavigations).toStrictEqual([]);
          expect(result).toBe(UNKNOWN_ROUTE);
        },
      );

      it("a Back to a same-document entry with no route", async () => {
        // An entry the router never took: written while it was stopped.
        router.stop();
        mockNav.historyPushState("http://localhost/orders/unknown");
        mockNav.historyPushState("http://localhost/users/list");
        await router.start();

        expect(router.getState()?.name).toBe("users.list");

        const result = await outcome(mockNav.back().finished);

        expect(result).toBe(
          allowNotFound ? UNKNOWN_ROUTE : errorCodes.ROUTE_NOT_FOUND,
        );
      });
    });

    // Starting a download cancels a navigation the router is still taking,
    // and its URL is already committed; the document stays (#2724).
    describe("a download while the router is still taking a navigation", () => {
      const settle = (): Promise<void> =>
        new Promise((resolve) => {
          setTimeout(resolve, 40);
        });

      // An activation guard that answers `true` after 20 ms.
      const slowGuard = (name: string): void => {
        getLifecycleApi(router).addActivateGuard(
          name,
          () => () =>
            new Promise<boolean>((resolve) => {
              setTimeout(() => {
                resolve(true);
              }, 20);
            }),
        );
      };

      // The navigation to `users.list` commits its URL and then waits on its
      // guard; the download aborts it there.
      const takeSlowNavigation = (): Promise<unknown> => {
        slowGuard("users.list");

        return mockNav.navigate("http://localhost/users/list").finished;
      };

      it("puts the URL back on the route the router stayed on", async () => {
        const finished = takeSlowNavigation();

        mockNav.download("http://localhost/files/report.txt");
        await finished;
        await settle();

        expect(mockNav.downloads).toStrictEqual([
          "http://localhost/files/report.txt",
        ]);
        expect(router.getState()?.name).toBe("home");
        expect(mockNav.currentUrl).toBe("http://localhost/home");
      });

      // The newer navigation is still waiting on its own guard when the write
      // would run.
      it("leaves the URL to a navigation the router takes before the write", async () => {
        const finished = takeSlowNavigation();

        slowGuard("users.view");
        mockNav.download("http://localhost/files/report.txt");
        const newer = mockNav.navigate("http://localhost/users/view/7");

        await finished;
        await newer.finished;
        await settle();

        expect(router.getState()?.name).toBe("users.view");
        expect(mockNav.currentUrl).toBe("http://localhost/users/view/7");
        // No write of the plugin's own: the newer navigation's URL was already
        // the one it committed.
        expect(
          events.filter((event) => event.info !== undefined),
        ).toStrictEqual([]);
      });

      it("leaves the URL to a navigation the router commits before the write", async () => {
        const finished = takeSlowNavigation();

        mockNav.download("http://localhost/files/report.txt");
        await router.navigate("users.view", { id: "7" });
        await finished.catch(() => undefined);
        await settle();

        expect(router.getState()?.name).toBe("users.view");
        expect(mockNav.currentUrl).toBe("http://localhost/users/view/7");
      });

      // The navigation to the URL with no route aborted the slow one, and the
      // router took it to the end.
      it("writes nothing after a navigation to a URL with no route", async () => {
        const finished = takeSlowNavigation();

        await mockNav.historyPushState("/nope").finished.catch(() => undefined);
        mockNav.download("http://localhost/files/report.txt");
        await finished.catch(() => undefined);
        await settle();

        expect(router.getState()?.name).toBe(
          allowNotFound ? UNKNOWN_ROUTE : "home",
        );
        expect(mockNav.currentUrl).toBe(
          allowNotFound ? "http://localhost/nope" : "http://localhost/home",
        );
      });

      it("writes nothing after a navigation the router finished", async () => {
        await mockNav.navigate("http://localhost/users/list").finished;

        mockNav.download("http://localhost/files/report.txt");
        await settle();

        expect(events.map((event) => event.navigationType)).toStrictEqual([
          "push",
          "push",
        ]);
        expect(mockNav.currentUrl).toBe("http://localhost/users/list");
      });

      // The refused navigation is over once the plugin has returned from it,
      // and the URL the application writes afterwards is not the router's to
      // take back.
      it("keeps a URL the application wrote after a refused navigation", async () => {
        getLifecycleApi(router).addDeactivateGuard("home", () => () => false);
        await mockNav
          .navigate("http://localhost/users/list")
          .finished.catch(() => undefined);
        router.replaceHistoryState("users.view", { id: "9" });

        mockNav.download("http://localhost/files/report.txt");
        await settle();

        expect(mockNav.downloads).toStrictEqual([
          "http://localhost/files/report.txt",
        ]);
        expect(mockNav.currentUrl).toBe("http://localhost/users/view/9");
      });

      it("writes nothing once the router has stopped", async () => {
        const finished = takeSlowNavigation();

        mockNav.download("http://localhost/files/report.txt");
        await finished;
        router.stop();
        await settle();

        expect(mockNav.crossDocumentNavigations).toStrictEqual([]);
        expect(mockNav.currentUrl).toBe("http://localhost/users/list");
      });
    });
  },
);
