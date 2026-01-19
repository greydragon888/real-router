import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  supportsConsoleGroups,
  createGroupManager,
} from "../../../modules/internal/console-groups";

describe("console-groups utilities", () => {
  describe("supportsConsoleGroups", () => {
    it("should return true when console.group is available", () => {
      expect(supportsConsoleGroups()).toBe(true);
    });

    it("should return false when console is undefined", () => {
      const originalConsole = globalThis.console;

      // @ts-expect-error - testing edge case
      globalThis.console = undefined;

      expect(supportsConsoleGroups()).toBe(false);

      globalThis.console = originalConsole;
    });

    it("should return false when console.group is missing", () => {
      const originalGroup = console.group;

      // @ts-expect-error - testing edge case
      console.group = undefined;

      expect(supportsConsoleGroups()).toBe(false);

      console.group = originalGroup;
    });

    it("should return false when console.groupEnd is missing", () => {
      const originalGroupEnd = console.groupEnd;

      // @ts-expect-error - testing edge case
      console.groupEnd = undefined;

      expect(supportsConsoleGroups()).toBe(false);

      console.groupEnd = originalGroupEnd;
    });
  });

  describe("createGroupManager", () => {
    let groupSpy: ReturnType<typeof vi.spyOn>;
    let groupEndSpy: ReturnType<typeof vi.spyOn>;
    const noop = () => {};

    beforeEach(() => {
      groupSpy = vi.spyOn(console, "group").mockImplementation(noop);
      groupEndSpy = vi.spyOn(console, "groupEnd").mockImplementation(noop);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    describe("when enabled", () => {
      it("should open group when not already open", () => {
        const manager = createGroupManager(true);

        manager.open("Test Group");

        expect(groupSpy).toHaveBeenCalledWith("Test Group");
        expect(groupSpy).toHaveBeenCalledTimes(1);
      });

      it("should not open group twice", () => {
        const manager = createGroupManager(true);

        manager.open("Test Group");
        manager.open("Another Group");

        expect(groupSpy).toHaveBeenCalledTimes(1);
        expect(groupSpy).toHaveBeenCalledWith("Test Group");
      });

      it("should close group when open", () => {
        const manager = createGroupManager(true);

        manager.open("Test Group");
        manager.close();

        expect(groupEndSpy).toHaveBeenCalledTimes(1);
      });

      it("should not close group when not open", () => {
        const manager = createGroupManager(true);

        manager.close();

        expect(groupEndSpy).not.toHaveBeenCalled();
      });

      it("should allow reopening after close", () => {
        const manager = createGroupManager(true);

        manager.open("First");
        manager.close();
        manager.open("Second");

        expect(groupSpy).toHaveBeenCalledTimes(2);
        expect(groupSpy).toHaveBeenNthCalledWith(1, "First");
        expect(groupSpy).toHaveBeenNthCalledWith(2, "Second");
      });

      it("should report correct open state", () => {
        const manager = createGroupManager(true);

        expect(manager.isOpen()).toBe(false);

        manager.open("Test");

        expect(manager.isOpen()).toBe(true);

        manager.close();

        expect(manager.isOpen()).toBe(false);
      });
    });

    describe("when disabled", () => {
      it("should not call console.group", () => {
        const manager = createGroupManager(false);

        manager.open("Test Group");

        expect(groupSpy).not.toHaveBeenCalled();
      });

      it("should not call console.groupEnd", () => {
        const manager = createGroupManager(false);

        manager.close();

        expect(groupEndSpy).not.toHaveBeenCalled();
      });

      it("should always report closed state", () => {
        const manager = createGroupManager(false);

        expect(manager.isOpen()).toBe(false);

        manager.open("Test");

        expect(manager.isOpen()).toBe(false);
      });
    });

    describe("state isolation", () => {
      it("should maintain separate state for each instance", () => {
        const manager1 = createGroupManager(true);
        const manager2 = createGroupManager(true);

        manager1.open("Group 1");

        expect(manager1.isOpen()).toBe(true);
        expect(manager2.isOpen()).toBe(false);
      });
    });
  });
});
