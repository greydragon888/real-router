// packages/validation-plugin/src/validators/plugins.ts

const DEFAULT_MAX_PLUGINS = 50;

export function validatePluginLimit(
  currentCount: number,
  newCount: number,
  maxPlugins: number = DEFAULT_MAX_PLUGINS,
): void {
  if (maxPlugins === 0) {
    return;
  }

  const totalCount = currentCount + newCount;

  if (totalCount > maxPlugins) {
    throw new Error(
      `[router.usePlugin] Plugin limit exceeded (${maxPlugins}). ` +
        `Current: ${currentCount}, Attempting to add: ${newCount}. ` +
        `This indicates an architectural problem. Consider consolidating plugins.`,
    );
  }
}
