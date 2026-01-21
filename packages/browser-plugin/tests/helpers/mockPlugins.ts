// Mock plugin factories for integration testing
// These synthetic plugins allow testing various edge cases without external dependencies

import type { PluginFactory, State } from "@real-router/core";

/**
 * Options for creating a tracking plugin that records hook calls
 */
export interface TrackingPluginOptions {
  /** Namespace for tracking (appears in executionOrder array) */
  namespace?: string;
  /** Array to push execution events to */
  executionOrder?: string[];
  /** Array to push state snapshots to */
  stateHistory?: State[];
}

/**
 * Creates a plugin that tracks hook execution order and state changes.
 * Useful for verifying that hooks are called in the correct sequence.
 *
 * @example
 * const executionOrder: string[] = [];
 * router.usePlugin(createTrackingPlugin({ namespace: "plugin1", executionOrder }));
 * router.usePlugin(browserPlugin());
 * router.navigate("route");
 * // executionOrder will contain ["plugin1:onTransitionSuccess", ...]
 */
export const createTrackingPlugin = (
  options: TrackingPluginOptions = {},
): PluginFactory => {
  const namespace = options.namespace ?? "tracking";
  const executionOrder = options.executionOrder ?? [];
  const stateHistory = options.stateHistory ?? [];

  return () => ({
    onStart: () => {
      executionOrder.push(`${namespace}:onStart`);
    },
    onStop: () => {
      executionOrder.push(`${namespace}:onStop`);
    },
    onTransitionStart: (toState: State) => {
      executionOrder.push(`${namespace}:onTransitionStart`);
      stateHistory.push({ ...toState });
    },
    onTransitionSuccess: (toState: State) => {
      executionOrder.push(`${namespace}:onTransitionSuccess`);
      stateHistory.push({ ...toState });
    },
    onTransitionError: () => {
      executionOrder.push(`${namespace}:onTransitionError`);
    },
    onTransitionCancel: () => {
      executionOrder.push(`${namespace}:onTransitionCancel`);
    },
  });
};

/**
 * Options for creating a state-modifying plugin
 */
export interface StateModifierPluginOptions {
  /** Function to modify the toState */
  modifyState?: (toState: State) => void;
  /** Whether to modify on start */
  modifyOnStart?: boolean;
  /** Whether to modify on success */
  modifyOnSuccess?: boolean;
}

/**
 * Creates a plugin that modifies state during transitions.
 * Useful for testing state mutation edge cases.
 *
 * @example
 * router.usePlugin(createStateModifierPlugin({
 *   modifyState: (state) => { state.params.modified = true; }
 * }));
 */
// Helper to create state modifier middleware
const createStateModifierMiddleware =
  (modifyState: (state: State) => void) => (toState: State) => {
    // Create mutable copy of state with new params object
    const newState = {
      ...toState,
      params: { ...toState.params },
    };

    // Allow modifier to mutate the copy
    modifyState(newState);

    // Return the modified state
    return newState;
  };

export const createStateModifierPlugin = (
  options: StateModifierPluginOptions = {},
): PluginFactory => {
  const {
    modifyState = () => {},
    modifyOnStart = false,
    modifyOnSuccess = true,
  } = options;

  return (router) => {
    // Use middleware to modify state during transition
    router.useMiddleware(() => createStateModifierMiddleware(modifyState));

    return {
      ...(modifyOnStart && { onStart: () => {} }),
      ...(modifyOnSuccess && { onTransitionSuccess: () => {} }),
    };
  };
};

/**
 * Options for creating an error-throwing plugin
 */
export interface ErrorPluginOptions {
  /** Error to throw */
  error?: Error;
  /** Which hook should throw */
  throwOn?: "onStart" | "onTransitionStart" | "onTransitionSuccess";
  /** Whether to throw only once */
  throwOnce?: boolean;
}

/**
 * Creates a plugin that throws errors during hooks.
 * Useful for testing error handling and recovery.
 *
 * @example
 * router.usePlugin(createErrorPlugin({
 *   throwOn: "onTransitionSuccess",
 *   error: new Error("Test error")
 * }));
 */
export const createErrorPlugin = (
  options: ErrorPluginOptions = {},
): PluginFactory => {
  const {
    error = new Error("Plugin error"),
    throwOn = "onTransitionSuccess",
    throwOnce = false,
  } = options;

  let hasThrown = false;

  const throwError = () => {
    if (throwOnce && hasThrown) {
      return;
    }

    hasThrown = true;

    throw error;
  };

  return () => ({
    ...(throwOn === "onStart" && { onStart: throwError }),
    ...(throwOn === "onTransitionStart" && {
      onTransitionStart: throwError,
    }),
    ...(throwOn === "onTransitionSuccess" && {
      onTransitionSuccess: throwError,
    }),
  });
};

/**
 * Options for creating a persistent params plugin
 */
export interface PersistentParamsPluginOptions {
  /** List of param names to persist */
  params: string[];
}

/**
 * Creates a simplified persistent params plugin.
 * Lighter version of persistent-params-plugin for testing.
 *
 * @example
 * router.usePlugin(createPersistentParamsPlugin({ params: ["lang", "theme"] }));
 */
// Helper middleware for storing persistent params
const createStorePersistentParamsMiddleware =
  (
    persistentParams: string[],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    persistentParamsValues: Record<string, any>,
  ) =>
  (toState: State) => {
    persistentParams.forEach((param) => {
      if (toState.params[param] !== undefined) {
        persistentParamsValues[param] = toState.params[param];
      }
    });

    return true;
  };

// Helper middleware for restoring persistent params
const createRestorePersistentParamsMiddleware =
  (
    persistentParams: string[],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    persistentParamsValues: Record<string, any>,
  ) =>
  // eslint-disable-next-line sonarjs/function-return-type
  (toState: State): State | true => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const missingParams: Record<string, any> = {};
    let needsUpdate = false;

    persistentParams.forEach((param) => {
      if (
        toState.params[param] === undefined &&
        persistentParamsValues[param] !== undefined
      ) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        missingParams[param] = persistentParamsValues[param];
        needsUpdate = true;
      }
    });

    // Return new state object with restored params
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    return needsUpdate
      ? {
          ...toState,
          params: { ...toState.params, ...missingParams },
        }
      : true;
  };

export const createPersistentParamsPlugin = (
  options: PersistentParamsPluginOptions,
): PluginFactory => {
  const persistentParams = options.params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const persistentParamsValues: Record<string, any> = {};

  return (router) => {
    // Store middleware that captures persistent params
    router.useMiddleware(() =>
      createStorePersistentParamsMiddleware(
        persistentParams,
        persistentParamsValues,
      ),
    );

    // Restore middleware that restores persistent params
    // Returns a new state object instead of mutating
    router.useMiddleware(() =>
      createRestorePersistentParamsMiddleware(
        persistentParams,
        persistentParamsValues,
      ),
    );

    return {
      onTransitionSuccess: (toState: State) => {
        // Update stored values on successful transition
        persistentParams.forEach((param) => {
          if (toState.params[param] !== undefined) {
            persistentParamsValues[param] = toState.params[param];
          }
        });
      },
    };
  };
};

/**
 * Options for creating a logger plugin
 */
export interface LoggerPluginOptions {
  /** Array to log messages to */
  logs?: string[];
}

/**
 * Creates a simplified logger plugin.
 * Lighter version of logger-plugin for testing.
 *
 * @example
 * const logs: string[] = [];
 * router.usePlugin(createLoggerPlugin({ logs }));
 */
export const createLoggerPlugin = (
  options: LoggerPluginOptions = {},
): PluginFactory => {
  const logs = options.logs ?? [];

  return () => ({
    onStart: () => {
      logs.push("Router started");
    },
    onStop: () => {
      logs.push("Router stopped");
    },
    onTransitionStart: (toState: State, fromState?: State) => {
      logs.push(`Transition: ${fromState?.name ?? "null"} → ${toState.name}`);
    },
    onTransitionSuccess: (toState: State) => {
      logs.push(`Success: ${toState.name}`);
    },
    onTransitionError: (
      _toState: State | undefined,
      _fromState: State | undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      err: any,
    ) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      logs.push(`Error: ${(err.code ?? err.message) as string}`);
    },
  });
};

/**
 * Options for creating an async plugin
 */
export interface AsyncPluginOptions {
  /** Delay in ms before completing transition */
  delay?: number;
  /** Whether to use middleware (affects transition timing) */
  useMiddleware?: boolean;
}

// Helper to create async delay middleware
const createAsyncDelayMiddleware = (delay: number) => async () => {
  await new Promise((resolve) => setTimeout(resolve, delay));

  return true;
};

/**
 * Creates a plugin with async middleware.
 * Useful for testing async transition scenarios.
 *
 * @example
 * router.usePlugin(createAsyncPlugin({ delay: 100 }));
 */
export const createAsyncPlugin = (
  options: AsyncPluginOptions = {},
): PluginFactory => {
  const { delay = 50, useMiddleware = true } = options;

  return (router) => {
    if (useMiddleware) {
      router.useMiddleware(() => createAsyncDelayMiddleware(delay));
    }

    return {};
  };
};
