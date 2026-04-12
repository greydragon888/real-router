import { fc, test } from "@fast-check/vitest";
import { getPluginApi } from "@real-router/core/api";
import { describe, expect } from "vitest";

import {
  LEAF_ROUTE_NAMES,
  PARAM_ROUTE_NAME,
  arbLeafRoute,
  arbIdParam,
  createPluginRouterWithMock,
} from "./helpers";
import { findLastEntryForRoute } from "../../src/history-extensions";

import type { NavigationBrowser } from "../../src";
import type { MockNavigation } from "../helpers/mockNavigation";
import type { Router } from "@real-router/core";
import type { PluginApi } from "@real-router/core/api";


// =============================================================================
// Model
// =============================================================================

interface HistoryModel {
  /** Route names in the history stack (ordered) */
  stack: string[];
  /** Current position in the stack */
  cursor: number;
  /** Whether the router has been started */
  started: boolean;
  /** Current route params (for SAME_STATES prevention) */
  currentParams: Record<string, string>;
}

interface HistoryReal {
  router: Router;
  mockNav: MockNavigation;
  browser: NavigationBrowser;
  api: PluginApi;
}

// =============================================================================
// Commands
// =============================================================================

class NavigateCommand implements fc.AsyncCommand<HistoryModel, HistoryReal> {
  constructor(
    readonly routeName: string,
    readonly params?: { id: string },
  ) {}

  check(m: Readonly<HistoryModel>) {
    if (!m.started) {
      return false;
    }

    if (m.stack[m.cursor] !== this.routeName) {
      return true;
    }

    // Same route — check if params differ
    if (this.params) {
      return this.params.id !== m.currentParams.id;
    }

    // Same leaf route, same params — skip to prevent SAME_STATES
    return false;
  }

  async run(m: HistoryModel, r: HistoryReal) {
    await r.router.navigate(this.routeName, this.params ?? {});

    m.stack = m.stack.slice(0, m.cursor + 1);
    m.stack.push(this.routeName);
    m.cursor = m.stack.length - 1;
    m.currentParams = this.params ? { ...this.params } : {};
  }

  toString() {
    return this.params
      ? `navigate(${this.routeName}, ${JSON.stringify(this.params)})`
      : `navigate(${this.routeName})`;
  }
}

class BackCommand implements fc.AsyncCommand<HistoryModel, HistoryReal> {
  check(m: Readonly<HistoryModel>) {
    return m.started && m.cursor > 0;
  }

  async run(m: HistoryModel, r: HistoryReal) {
    await r.mockNav.goBack();
    await new Promise((resolve) => setTimeout(resolve, 10));
    m.cursor--;
    m.currentParams = {};
  }

  toString() {
    return "back()";
  }
}

class ForwardCommand implements fc.AsyncCommand<HistoryModel, HistoryReal> {
  check(m: Readonly<HistoryModel>) {
    return m.started && m.cursor < m.stack.length - 1;
  }

  async run(m: HistoryModel, r: HistoryReal) {
    await r.mockNav.goForward();
    await new Promise((resolve) => setTimeout(resolve, 10));
    m.cursor++;
    m.currentParams = {};
  }

  toString() {
    return "forward()";
  }
}

// =============================================================================
// Assertion Commands (check invariants)
// =============================================================================

class AssertCanGoBackCommand implements fc.AsyncCommand<
  HistoryModel,
  HistoryReal
> {
  check(m: Readonly<HistoryModel>) {
    return m.started;
  }

  async run(m: HistoryModel, r: HistoryReal) {
    expect(r.router.canGoBack()).toBe(m.cursor > 0);
  }

  toString() {
    return "assertCanGoBack()";
  }
}

class AssertCanGoForwardCommand implements fc.AsyncCommand<
  HistoryModel,
  HistoryReal
> {
  check(m: Readonly<HistoryModel>) {
    return m.started;
  }

  async run(m: HistoryModel, r: HistoryReal) {
    expect(r.router.canGoForward()).toBe(m.cursor < m.stack.length - 1);
  }

  toString() {
    return "assertCanGoForward()";
  }
}

class AssertPeekBackCommand implements fc.AsyncCommand<
  HistoryModel,
  HistoryReal
> {
  check(m: Readonly<HistoryModel>) {
    return m.started;
  }

  async run(m: HistoryModel, r: HistoryReal) {
    const peeked = r.router.peekBack();

    if (m.cursor > 0) {
      expect(peeked).toBeDefined();
      expect(peeked!.name).toBe(m.stack[m.cursor - 1]);
    } else {
      expect(peeked).toBeUndefined();
    }
  }

  toString() {
    return "assertPeekBack()";
  }
}

class AssertPeekForwardCommand implements fc.AsyncCommand<
  HistoryModel,
  HistoryReal
> {
  check(m: Readonly<HistoryModel>) {
    return m.started;
  }

  async run(m: HistoryModel, r: HistoryReal) {
    const peeked = r.router.peekForward();

    if (m.cursor < m.stack.length - 1) {
      expect(peeked).toBeDefined();
      expect(peeked!.name).toBe(m.stack[m.cursor + 1]);
    } else {
      expect(peeked).toBeUndefined();
    }
  }

  toString() {
    return "assertPeekForward()";
  }
}

class AssertVisitedCommand implements fc.AsyncCommand<
  HistoryModel,
  HistoryReal
> {
  check(m: Readonly<HistoryModel>) {
    return m.started;
  }

  async run(m: HistoryModel, r: HistoryReal) {
    const uniqueRoutes = [...new Set(m.stack)];
    const visited = r.router.getVisitedRoutes();

    for (const route of uniqueRoutes) {
      expect(r.router.hasVisited(route)).toBe(true);
    }

    expect(visited.toSorted((a, b) => a.localeCompare(b))).toStrictEqual(
      uniqueRoutes.toSorted((a, b) => a.localeCompare(b)),
    );

    for (const route of uniqueRoutes) {
      const expected = m.stack.filter((name) => name === route).length;

      expect(r.router.getRouteVisitCount(route)).toBe(expected);
    }
  }

  toString() {
    return "assertVisited()";
  }
}

class AssertCanGoBackToCommand implements fc.AsyncCommand<
  HistoryModel,
  HistoryReal
> {
  check(m: Readonly<HistoryModel>) {
    return m.started;
  }

  async run(m: HistoryModel, r: HistoryReal) {
    const backEntries = new Set(m.stack.slice(0, m.cursor));

    for (const routeName of LEAF_ROUTE_NAMES) {
      const expected = backEntries.has(routeName);

      expect(r.router.canGoBackTo(routeName)).toBe(expected);
    }
  }

  toString() {
    return "assertCanGoBackTo()";
  }
}

class AssertMetaExistsCommand implements fc.AsyncCommand<
  HistoryModel,
  HistoryReal
> {
  check(m: Readonly<HistoryModel>) {
    return m.started;
  }

  async run(_m: HistoryModel, r: HistoryReal) {
    const state = r.router.getState();

    if (state) {
      const meta = state.context.navigation;

      expect(meta).toBeDefined();
      expect(meta!.navigationType).toBeDefined();
      expect(typeof meta!.userInitiated).toBe("boolean");
    }
  }

  toString() {
    return "assertMetaExists()";
  }
}

class AssertFindLastEntryForRouteCommand implements fc.AsyncCommand<
  HistoryModel,
  HistoryReal
> {
  check(m: Readonly<HistoryModel>) {
    return m.started;
  }

  async run(m: HistoryModel, r: HistoryReal) {
    const entries = r.browser.entries();
    const currentKey = r.browser.currentEntry?.key;

    for (const routeName of LEAF_ROUTE_NAMES) {
      // Model: find last index != cursor where stack[i] === routeName
      let expectedIndex = -1;

      for (let i = m.stack.length - 1; i >= 0; i--) {
        if (i !== m.cursor && m.stack[i] === routeName) {
          expectedIndex = i;

          break;
        }
      }

      const result = findLastEntryForRoute(
        entries,
        routeName,
        r.api,
        "",
        currentKey,
      );

      if (expectedIndex === -1) {
        expect(result).toBeUndefined();
      } else {
        expect(result).toBeDefined();
      }
    }
  }

  toString() {
    return "assertFindLastEntryForRoute()";
  }
}

class AssertNavigationTypeCommand implements fc.AsyncCommand<
  HistoryModel,
  HistoryReal
> {
  check(m: Readonly<HistoryModel>) {
    return m.started;
  }

  async run(_m: HistoryModel, r: HistoryReal) {
    const state = r.router.getState();

    if (!state) {
      return;
    }

    const meta = state.context.navigation;

    expect(meta).toBeDefined();

    const validTypes = ["push", "replace", "traverse", "reload"];

    expect(validTypes).toContain(meta!.navigationType);

    const validDirections = ["forward", "back", "unknown"];

    expect(validDirections).toContain(meta!.direction);
  }

  toString() {
    return "assertNavigationType()";
  }
}

// =============================================================================
// Test
// =============================================================================

const allCommands = [
  arbLeafRoute.map((name) => new NavigateCommand(name)),
  arbLeafRoute.map((name) => new NavigateCommand(name)),
  arbLeafRoute.map((name) => new NavigateCommand(name)),
  arbIdParam.map((params) => new NavigateCommand(PARAM_ROUTE_NAME, params)),

  fc.constant(new BackCommand()),
  fc.constant(new ForwardCommand()),

  fc.constant(new AssertCanGoBackCommand()),
  fc.constant(new AssertCanGoForwardCommand()),
  fc.constant(new AssertPeekBackCommand()),
  fc.constant(new AssertPeekForwardCommand()),
  fc.constant(new AssertVisitedCommand()),
  fc.constant(new AssertCanGoBackToCommand()),
  fc.constant(new AssertMetaExistsCommand()),
  fc.constant(new AssertFindLastEntryForRouteCommand()),
  fc.constant(new AssertNavigationTypeCommand()),
];

describe("Navigation Plugin History Model", () => {
  test.prop([fc.commands(allCommands, { size: "+1" })], {
    numRuns: 100,
  })(
    "history extensions stay consistent under random navigation sequences",
    async (cmds) => {
      const { router, mockNav, browser } = createPluginRouterWithMock();
      const api = getPluginApi(router);

      const initialRoute = "index";

      await router.start("/");

      const setup = (): { model: HistoryModel; real: HistoryReal } => ({
        model: {
          stack: [initialRoute],
          cursor: 0,
          started: true,
          currentParams: {},
        },
        real: { router, mockNav, browser, api },
      });

      await fc.asyncModelRun(setup, cmds);

      router.stop();
    },
  );
});
