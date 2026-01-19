// packages/router6-plugin-logger/modules/internal/console-groups.ts

/**
 * Checks if console.group is supported in the current environment.
 */
export const supportsConsoleGroups = (): boolean => {
  return (
    typeof console !== "undefined" &&
    typeof console.group === "function" &&
    typeof console.groupEnd === "function"
  );
};

/**
 * Manager for handling console groups
 */
interface GroupManager {
  /**
   * Opens a group if it's not already open
   */
  open: (label: string) => void;
  /**
   * Closes a group if it's open
   */
  close: () => void;
  /**
   * Checks if a group is currently open
   */
  isOpen: () => boolean;
}

/**
 * Creates a manager for handling console groups.
 * Prevents duplicate group opening.
 *
 * @param enabled - Whether groups are supported in the environment
 * @returns Object with open and close methods
 */
export const createGroupManager = (enabled: boolean): GroupManager => {
  let isOpened = false;

  return {
    /**
     * Opens a group if it's not already open.
     */
    open(label: string): void {
      if (!enabled || isOpened) {
        return;
      }

      console.group(label);
      isOpened = true;
    },

    /**
     * Closes a group if it's open.
     */
    close(): void {
      if (!enabled || !isOpened) {
        return;
      }

      console.groupEnd();
      isOpened = false;
    },

    /**
     * Checks if a group is currently open.
     */
    isOpen(): boolean {
      return isOpened;
    },
  };
};
