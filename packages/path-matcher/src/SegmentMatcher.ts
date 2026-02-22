import {
  defaultBuildQueryString,
  defaultParseQueryString,
} from "./defaultQueryString";
import { DECODING_METHODS } from "./encoding";
import { createSegmentNode, normalizeTrailingSlash } from "./pathUtils";
import { validatePercentEncoding } from "./percentEncoding";
import { registerNode } from "./registration";

import type {
  BuildPathOptions,
  CompiledRoute,
  MatcherInputNode,
  MatchResult,
  ResolvedMatcherOptions,
  SegmentMatcherOptions,
  SegmentNode,
} from "./types";

// =============================================================================
// Constants
// =============================================================================

const RAW_UNICODE_PATTERN = /[\u0080-\uFFFF]/;

// =============================================================================
// SegmentMatcher Class
// =============================================================================

export class SegmentMatcher {
  get options(): ResolvedMatcherOptions {
    return this.#options;
  }

  readonly #options: ResolvedMatcherOptions;

  readonly #root: SegmentNode = createSegmentNode();
  readonly #routesByName = new Map<string, CompiledRoute>();
  readonly #segmentsByName = new Map<string, readonly MatcherInputNode[]>();
  readonly #metaByName = new Map<
    string,
    Readonly<Record<string, Record<string, "url" | "query">>>
  >();
  readonly #staticCache = new Map<string, CompiledRoute>();

  #rootPath = "";
  #rootQueryParams: readonly string[] = [];

  constructor(options?: SegmentMatcherOptions) {
    this.#options = {
      caseSensitive: options?.caseSensitive ?? true,
      strictTrailingSlash: options?.strictTrailingSlash ?? false,
      strictQueryParams: options?.strictQueryParams ?? false,
      urlParamsEncoding: options?.urlParamsEncoding ?? "default",
      parseQueryString: options?.parseQueryString ?? defaultParseQueryString,
      buildQueryString: options?.buildQueryString ?? defaultBuildQueryString,
    };
  }

  registerTree(node: MatcherInputNode): void {
    this.#rootQueryParams = node.paramMeta.queryParams;
    registerNode(
      {
        root: this.#root,
        options: this.#options,
        routesByName: this.#routesByName,
        segmentsByName: this.#segmentsByName,
        metaByName: this.#metaByName,
        staticCache: this.#staticCache,
        rootQueryParams: this.#rootQueryParams,
      },
      node,
      "",
      [],
      null,
    );
  }

  match(path: string): MatchResult | undefined {
    const prepared = this.#preparePath(path);

    if (!prepared) {
      return undefined;
    }

    const [cleanPath, normalized, queryString] = prepared;

    const cacheKey = this.#options.caseSensitive
      ? normalized
      : normalized.toLowerCase();
    const cached = this.#staticCache.get(cacheKey);

    if (cached) {
      if (
        this.#options.strictTrailingSlash &&
        !this.#checkTrailingSlash(cleanPath, cached)
      ) {
        return undefined;
      }

      return this.#buildResult(cached, {}, queryString);
    }

    const params: Record<string, string> = {};
    const route = this.#traverse(normalized, params);

    if (!route) {
      return undefined;
    }

    if (
      this.#options.strictTrailingSlash &&
      !this.#checkTrailingSlash(cleanPath, route)
    ) {
      return undefined;
    }

    if (route.hasConstraints && !this.#validateConstraints(params, route)) {
      return undefined;
    }

    if (!this.#decodeParams(params)) {
      return undefined;
    }

    return this.#buildResult(route, params, queryString);
  }

  buildPath(
    name: string,
    params?: Record<string, unknown>,
    options?: BuildPathOptions,
  ): string {
    const route = this.#routesByName.get(name);

    if (!route) {
      throw new Error(`[SegmentMatcher.buildPath] '${name}' is not defined`);
    }

    if (route.hasConstraints && params) {
      this.#validateBuildConstraints(route, name, params);
    }

    const path = this.#buildUrlPath(route, params);
    const finalPath = this.#applyTrailingSlash(path, options?.trailingSlash);
    const queryString = this.#buildQueryStringForBuild(
      route,
      params,
      options?.queryParamsMode,
    );

    return finalPath + (queryString ? `?${queryString}` : "");
  }

  getSegmentsByName(name: string): readonly MatcherInputNode[] | undefined {
    return this.#segmentsByName.get(name);
  }

  getMetaByName(
    name: string,
  ): Readonly<Record<string, Record<string, "url" | "query">>> | undefined {
    return this.#metaByName.get(name);
  }

  hasRoute(name: string): boolean {
    return this.#routesByName.has(name);
  }

  setRootPath(rootPath: string): void {
    this.#rootPath = rootPath;
  }

  #validateBuildConstraints(
    route: CompiledRoute,
    name: string,
    params: Record<string, unknown>,
  ): void {
    for (const [paramName, constraint] of route.constraintPatterns) {
      const value = params[paramName];

      if (value !== undefined && value !== null) {
        const stringValue =
          typeof value === "object"
            ? JSON.stringify(value)
            : String(value as string | number | boolean);

        if (!constraint.pattern.test(stringValue)) {
          throw new Error(
            `[SegmentMatcher.buildPath] '${name}' — param '${paramName}' value '${stringValue}' does not match constraint '${constraint.constraint}'`,
          );
        }
      }
    }
  }

  #buildUrlPath(
    route: CompiledRoute,
    params: Record<string, unknown> | undefined,
  ): string {
    const parts = route.buildStaticParts;
    const slots = route.buildParamSlots;

    if (slots.length === 0) {
      return this.#rootPath + parts[0];
    }

    let result = this.#rootPath + parts[0];

    for (const [i, slot] of slots.entries()) {
      const value = params?.[slot.paramName];

      if (value === undefined || value === null) {
        if (!slot.isOptional) {
          throw new Error(
            `[SegmentMatcher.buildPath] Missing required param '${slot.paramName}'`,
          );
        }

        if (result.length > 1 && result.endsWith("/")) {
          result = result.slice(0, -1);
        }

        result += parts[i + 1];

        continue;
      }

      const stringValue =
        typeof value === "object"
          ? JSON.stringify(value)
          : String(value as string | number | boolean);
      const encoded = slot.encoder(stringValue);

      result += encoded + parts[i + 1];
    }

    return result;
  }

  #applyTrailingSlash(
    path: string,
    mode: BuildPathOptions["trailingSlash"],
  ): string {
    if (mode === "always" && !path.endsWith("/")) {
      return `${path}/`;
    }

    /* v8 ignore next 3 -- @preserve: trailing slash may not appear in buildStaticParts; integration-tested via core */
    if (mode === "never" && path !== "/" && path.endsWith("/")) {
      return path.slice(0, -1);
    }

    return path;
  }

  #buildQueryStringForBuild(
    route: CompiledRoute,
    params: Record<string, unknown> | undefined,
    queryParamsMode: BuildPathOptions["queryParamsMode"],
  ): string {
    if (!params) {
      return "";
    }

    const queryObj: Record<string, unknown> = {};
    let hasKeys = false;

    for (const name of route.declaredQueryParams) {
      if (name in params) {
        queryObj[name] = params[name];
        hasKeys = true;
      }
    }

    if (queryParamsMode === "loose") {
      for (const p in params) {
        if (
          Object.hasOwn(params, p) &&
          !route.declaredQueryParamsSet.has(p) &&
          !route.buildParamNamesSet.has(p)
        ) {
          queryObj[p] = params[p];
          hasKeys = true;
        }
      }
    }

    if (!hasKeys) {
      return "";
    }

    return this.#options.buildQueryString(queryObj);
  }

  #preparePath(
    path: string,
  ):
    | [cleanPath: string, normalized: string, queryString: string | undefined]
    | undefined {
    if (path === "") {
      path = "/";
    }

    if (!path.startsWith("/")) {
      return undefined;
    }

    const hashIdx = path.indexOf("#");

    if (hashIdx !== -1) {
      path = path.slice(0, hashIdx);
    }

    if (RAW_UNICODE_PATTERN.test(path)) {
      return undefined;
    }

    if (this.#rootPath.length > 0) {
      if (!path.startsWith(this.#rootPath)) {
        return undefined;
      }

      path = path.slice(this.#rootPath.length) || "/";
    }

    const qIdx = path.indexOf("?");
    const pathPart = qIdx === -1 ? path : path.slice(0, qIdx);
    const queryString = qIdx === -1 ? undefined : path.slice(qIdx + 1);

    if (pathPart.includes("//")) {
      return undefined;
    }

    const cleanPath = pathPart;

    const normalized = normalizeTrailingSlash(cleanPath);

    return [cleanPath, normalized, queryString];
  }

  #buildResult(
    route: CompiledRoute,
    params: Record<string, unknown>,
    queryString: string | undefined,
  ): MatchResult | undefined {
    if (queryString !== undefined) {
      const queryParams = this.#options.parseQueryString(queryString);

      if (this.#options.strictQueryParams) {
        const declared = route.declaredQueryParamsSet;

        for (const key of Object.keys(queryParams)) {
          if (!declared.has(key)) {
            return undefined;
          }
        }
      }

      for (const key of Object.keys(queryParams)) {
        params[key] = queryParams[key];
      }
    }

    return {
      segments: route.matchSegments,
      params,
      meta: route.meta,
    };
  }

  #checkTrailingSlash(cleanPath: string, route: CompiledRoute): boolean {
    const inputHasSlash = cleanPath.length > 1 && cleanPath.endsWith("/");

    return inputHasSlash === route.hasTrailingSlash;
  }

  #traverse(
    path: string,
    params: Record<string, string>,
  ): CompiledRoute | undefined {
    /* v8 ignore start -- @preserve: root "/" is always in #staticCache */
    if (path.length === 1) {
      return this.#root.slashChildRoute ?? this.#root.route;
    }
    /* v8 ignore stop */

    return this.#traverseFrom(this.#root, path, 1, params);
  }

  #traverseFrom(
    startNode: SegmentNode,
    path: string,
    start: number,
    params: Record<string, string>,
  ): CompiledRoute | undefined {
    let node = startNode;
    const len = path.length;

    while (start <= len) {
      const end = path.indexOf("/", start);
      const segmentEnd = end === -1 ? len : end;
      const segment = path.slice(start, segmentEnd);

      const lookupKey = this.#options.caseSensitive
        ? segment
        : segment.toLowerCase();
      let next: SegmentNode;

      if (lookupKey in node.staticChildren) {
        next = node.staticChildren[lookupKey];
      } else if (node.paramChild) {
        next = node.paramChild.node;
        params[node.paramChild.name] = segment;
      } else if (node.splatChild) {
        // Try specific child routes of splatChild before wildcard capture (static > param > splat)
        const childParams: Record<string, string> = {};
        const specific = this.#traverseFrom(
          node.splatChild.node,
          path,
          start,
          childParams,
        );

        if (specific) {
          Object.assign(params, childParams);

          return specific;
        }

        params[node.splatChild.name] = path.slice(start);

        return node.splatChild.node.route;
      } else {
        return undefined;
      }

      node = next;
      start = segmentEnd + 1;
    }

    return node.slashChildRoute ?? node.route;
  }

  #decodeParams(params: Record<string, string>): boolean {
    const encoding = this.#options.urlParamsEncoding;

    if (encoding === "none") {
      return true;
    }

    const decode = DECODING_METHODS[encoding];

    for (const key in params) {
      const v = params[key];

      if (!v.includes("%")) {
        continue;
      }

      if (!validatePercentEncoding(v)) {
        return false;
      }

      params[key] = decode(v);
    }

    return true;
  }

  #validateConstraints(
    params: Record<string, string>,
    route: CompiledRoute,
  ): boolean {
    for (const [paramName, constraint] of route.constraintPatterns) {
      if (!constraint.pattern.test(params[paramName])) {
        return false;
      }
    }

    return true;
  }
}

export { createSegmentNode } from "./pathUtils";

export {
  defaultParseQueryString,
  defaultBuildQueryString,
} from "./defaultQueryString";
