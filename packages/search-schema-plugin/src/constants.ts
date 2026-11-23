// packages/search-schema-plugin/src/constants.ts

/**
 * The context of the messages the plugin logs through the router's logger.
 * The logger's console output carries it in brackets ahead of each message.
 */
export const LOGGER_CONTEXT = "search-schema-plugin";

/** The head of the messages the plugin throws. */
export const ERROR_PREFIX = `[${LOGGER_CONTEXT}]`;
