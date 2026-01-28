// packages/react/modules/components/BaseLink.tsx

import { memo, useCallback, useMemo } from "react";

import { EMPTY_PARAMS, EMPTY_OPTIONS } from "../constants";
import { useIsActiveRoute } from "../hooks/useIsActiveRoute";
import { useStableValue } from "../hooks/useStableValue";
import { shouldNavigate } from "../utils";

import type { BaseLinkProps } from "../types";
import type { RouterError, State } from "@real-router/core";
import type { FC, MouseEvent } from "react";

/**
 * Optimized BaseLink component with memoization and performance improvements
 */
export const BaseLink: FC<BaseLinkProps> = memo(
  ({
    routeName,
    routeParams = EMPTY_PARAMS,
    routeOptions = EMPTY_OPTIONS,
    className,
    activeClassName = "active",
    activeStrict = false,
    ignoreQueryParams = true,
    onClick,
    successCallback,
    errorCallback,
    target,
    router,
    children,
    ...props
  }) => {
    // Stabilize object references to prevent unnecessary re-renders
    const stableParams = useStableValue(routeParams);
    const stableOptions = useStableValue(routeOptions);

    // Use optimized hook for active state checking
    const isActive = useIsActiveRoute(
      router,
      routeName,
      stableParams,
      activeStrict,
      ignoreQueryParams,
    );

    // Build URL with memoization
    const href = useMemo(() => {
      // Use buildUrl if available (browser plugin installed)
      // Otherwise fall back to buildPath (e.g., in SSR or without browser plugin)
      if (typeof router.buildUrl === "function") {
        return router.buildUrl(routeName, stableParams);
      }

      return router.buildPath(routeName, stableParams);
    }, [router, routeName, stableParams]);

    // Optimized click handler
    const handleClick = useCallback(
      (evt: MouseEvent<HTMLAnchorElement>) => {
        // Call custom onClick if provided
        if (onClick) {
          onClick(evt);
          // Respect preventDefault from custom handler
          if (evt.defaultPrevented) {
            return;
          }
        }

        // Check if we should handle navigation
        if (!shouldNavigate(evt) || target === "_blank") {
          return;
        }

        // Prevent default link behavior
        evt.preventDefault();

        // Create navigation callback if needed
        const done =
          successCallback || errorCallback
            ? (err?: RouterError, state?: State) => {
                if (err) {
                  errorCallback?.(err);
                } else {
                  successCallback?.(state);
                }
              }
            : undefined;

        // Perform navigation
        if (done) {
          router.navigate(routeName, stableParams, stableOptions, done);
        } else {
          router.navigate(routeName, stableParams, stableOptions);
        }
      },
      [
        onClick,
        target,
        router,
        routeName,
        stableParams,
        stableOptions,
        successCallback,
        errorCallback,
      ],
    );

    // Build className efficiently
    const finalClassName = useMemo(() => {
      if (isActive && activeClassName) {
        return className
          ? `${className} ${activeClassName}`.trim()
          : activeClassName;
      }

      return className ?? undefined;
    }, [isActive, className, activeClassName]);

    // Filter out previousRoute from props
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { previousRoute, ...restProps } = props;

    return (
      <a
        {...restProps}
        href={href}
        className={finalClassName}
        onClick={handleClick}
        data-route={routeName} // For event delegation if needed
        data-active={isActive} // For CSS selectors if needed
      >
        {children}
      </a>
    );
  },
  (prevProps, nextProps) => {
    // Custom comparison for better memoization
    // Check if props that affect rendering have changed
    return (
      prevProps.router === nextProps.router &&
      prevProps.routeName === nextProps.routeName &&
      JSON.stringify(prevProps.routeParams) ===
        JSON.stringify(nextProps.routeParams) &&
      JSON.stringify(prevProps.routeOptions) ===
        JSON.stringify(nextProps.routeOptions) &&
      prevProps.className === nextProps.className &&
      prevProps.activeClassName === nextProps.activeClassName &&
      prevProps.activeStrict === nextProps.activeStrict &&
      prevProps.ignoreQueryParams === nextProps.ignoreQueryParams &&
      prevProps.onClick === nextProps.onClick &&
      prevProps.successCallback === nextProps.successCallback &&
      prevProps.errorCallback === nextProps.errorCallback &&
      prevProps.target === nextProps.target &&
      prevProps.children === nextProps.children
    );
  },
);

BaseLink.displayName = "BaseLink";
