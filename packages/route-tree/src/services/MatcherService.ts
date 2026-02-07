// packages/route-tree/src/services/MatcherService.ts

import { addRoute, createRouter, findRoute } from "rou3";
import { parse as parseQueryParams } from "search-params";

import { validateConstraints } from "./constraintValidation";
import { DECODING_METHODS } from "./encoding";

import type { ConstraintPattern } from "./buildParamMeta";
import type { IMatcherService } from "./types";
import type { RouteTree } from "../builder/types";
import type {
  MatchOptions,
  MatchResult,
  RouteParams,
  URLParamsEncodingType,
} from "../operations/types";
import type { Options as QueryParamsOptions } from "search-params";

interface RouteData {
  segments: readonly RouteTree[];
  declaredQueryParams: readonly string[];
  hasTrailingSlash: boolean;
  hasConstraints: boolean;
}

export class MatcherService implements IMatcherService {
  readonly #router = createRouter();
  readonly #routesByName = new Map<string, readonly RouteTree[]>();

  registerTree(node: RouteTree, parentPath = ""): void {
    const segments: RouteTree[] = [];

    this.#registerNode(node, parentPath, segments);
  }

  match(path: string, options?: MatchOptions): MatchResult | undefined {
    const parsed = this.#parsePath(path, options?.strictTrailingSlash ?? false);

    if (!parsed) {
      return undefined;
    }

    const { pathWithoutQuery, queryString, originalPathWithoutQuery } = parsed;
    const result = findRoute(this.#router, "GET", pathWithoutQuery);

    if (!result) {
      return undefined;
    }

    const data = result.data as RouteData;

    if (!this.#validateTrailingSlash(pathWithoutQuery, data, options)) {
      return undefined;
    }

    const segmentsWithoutRoot = data.segments.filter((seg) => seg.path !== "");
    const params: RouteParams = { ...result.params };

    this.#decodeUrlParams(params, options?.urlParamsEncoding ?? "default");

    if (
      data.hasConstraints &&
      !this.#validateRouteConstraints(
        params,
        segmentsWithoutRoot,
        originalPathWithoutQuery,
      )
    ) {
      return undefined;
    }

    if (queryString) {
      const success = this.#processQueryParams(
        params,
        queryString,
        data.declaredQueryParams,
        options,
      );

      if (!success) {
        return undefined;
      }
    }

    return {
      segments: this.#appendSlashChild(segmentsWithoutRoot),
      params,
    };
  }

  getSegmentsByName(name: string): readonly RouteTree[] | undefined {
    const segments = this.#routesByName.get(name);

    if (!segments) {
      return undefined;
    }

    return segments.filter((seg) => seg.path !== "");
  }

  hasRoute(name: string): boolean {
    return this.#routesByName.has(name);
  }

  #parsePath(
    path: string,
    strictTrailingSlash: boolean,
  ):
    | {
        pathWithoutQuery: string;
        queryString: string;
        originalPathWithoutQuery: string;
      }
    | undefined {
    const normalizedPath = path === "" ? "/" : path;

    if (
      !normalizedPath.startsWith("/") ||
      this.#hasRawUnicode(normalizedPath)
    ) {
      return undefined;
    }

    const queryIndex = normalizedPath.indexOf("?");
    const originalPathWithoutQuery =
      queryIndex === -1 ? normalizedPath : normalizedPath.slice(0, queryIndex);
    const queryString =
      queryIndex === -1 ? "" : normalizedPath.slice(queryIndex + 1);

    const pathWithoutQuery = strictTrailingSlash
      ? originalPathWithoutQuery
      : this.#normalizeTrailingSlash(originalPathWithoutQuery);

    return { pathWithoutQuery, queryString, originalPathWithoutQuery };
  }

  #validateTrailingSlash(
    pathWithoutQuery: string,
    data: RouteData,
    options?: MatchOptions,
  ): boolean {
    if (!options?.strictTrailingSlash) {
      return true;
    }

    const inputHasTrailingSlash =
      pathWithoutQuery.length > 1 && pathWithoutQuery.endsWith("/");

    return inputHasTrailingSlash === data.hasTrailingSlash;
  }

  #decodeUrlParams(params: RouteParams, encoding: URLParamsEncodingType): void {
    if (encoding === "none") {
      return;
    }

    const decoder = DECODING_METHODS[encoding];

    for (const key in params) {
      // rou3 always returns string params; check is defensive for type safety
      /* istanbul ignore else -- @preserve */
      if (typeof params[key] === "string") {
        params[key] = decoder(params[key]);
      }
    }
  }

  #validateRouteConstraints(
    params: RouteParams,
    segments: readonly RouteTree[],
    path: string,
  ): boolean {
    const constraintPatterns = this.#collectConstraintPatterns(segments);

    try {
      validateConstraints(params, constraintPatterns, path);

      return true;
    } catch {
      return false;
    }
  }

  #processQueryParams(
    params: RouteParams,
    queryString: string,
    declaredQueryParams: readonly string[],
    options?: MatchOptions,
  ): boolean {
    const allQueryParams = this.#parseQueryString(
      queryString,
      options?.queryParams,
    );
    const queryParamsMode = options?.queryParamsMode ?? "default";

    if (queryParamsMode !== "strict") {
      Object.assign(params, allQueryParams);

      return true;
    }

    // Strict mode: only allow declared query params
    const declaredSet = new Set(declaredQueryParams);

    for (const key of Object.keys(allQueryParams)) {
      if (!declaredSet.has(key)) {
        return false;
      }
    }

    for (const key of declaredQueryParams) {
      if (key in allQueryParams) {
        params[key] = allQueryParams[key];
      }
    }

    return true;
  }

  #registerNode(
    node: RouteTree,
    parentPath: string,
    segments: RouteTree[],
  ): void {
    segments.push(node);

    // For absolute paths, register at root level but keep parent in segments
    const isAbsolute = node.absolute;
    const registrationPath = isAbsolute ? "" : parentPath;
    const currentPath = this.#buildFullPath(registrationPath, node.path);
    const rou3Path = this.#convertToRou3Syntax(currentPath);
    const normalized = this.#normalizeTrailingSlash(rou3Path);

    if (node.fullName) {
      const declaredQueryParams = this.#collectDeclaredQueryParams(segments);
      const hasTrailingSlash = rou3Path.length > 1 && rou3Path.endsWith("/");
      const hasConstraints = this.#hasPathConstraints(segments);
      const routeData: RouteData = {
        segments: [...segments],
        declaredQueryParams,
        hasTrailingSlash,
        hasConstraints,
      };

      this.#routesByName.set(node.fullName, [...segments]);
      addRoute(this.#router, "GET", normalized, routeData);
    }

    // For children of absolute paths, use the absolute path as parent
    const childParentPath = currentPath;

    for (const child of node.children.values()) {
      this.#registerNode(child, childParentPath, segments);
    }

    segments.pop();
  }

  #collectDeclaredQueryParams(
    segments: readonly RouteTree[],
  ): readonly string[] {
    const queryParams: string[] = [];

    for (const segment of segments) {
      if (segment.paramMeta.queryParams.length > 0) {
        queryParams.push(...segment.paramMeta.queryParams);
      }
    }

    return queryParams;
  }

  #hasPathConstraints(segments: readonly RouteTree[]): boolean {
    for (const segment of segments) {
      if (segment.path.includes("<")) {
        return true;
      }
    }

    return false;
  }

  #collectConstraintPatterns(
    segments: readonly RouteTree[],
  ): ReadonlyMap<string, ConstraintPattern> {
    const patterns = new Map<string, ConstraintPattern>();

    for (const segment of segments) {
      for (const [paramName, pattern] of segment.paramMeta.constraintPatterns) {
        patterns.set(paramName, pattern);
      }
    }

    return patterns;
  }

  #normalizeTrailingSlash(path: string): string {
    if (path.length > 1 && path.endsWith("/")) {
      return path.slice(0, -1);
    }

    return path;
  }

  #buildFullPath(parentPath: string, nodePath: string): string {
    // Note: "~" prefix is already stripped in buildTree.ts, so nodePath never starts with "~"
    if (parentPath === "") {
      return nodePath;
    }

    // Handle query-only root paths (e.g., "?mode" from persistent-params-plugin)
    // These should be appended to the node path, not prepended
    if (parentPath.startsWith("?")) {
      if (nodePath === "") {
        return parentPath;
      }

      const nodeQueryIndex = nodePath.indexOf("?");

      if (nodeQueryIndex !== -1) {
        const nodePathPart = nodePath.slice(0, nodeQueryIndex);
        const nodeQueryPart = nodePath.slice(nodeQueryIndex + 1);

        return `${nodePathPart}?${parentPath.slice(1)}&${nodeQueryPart}`;
      }

      return `${nodePath}${parentPath}`;
    }

    if (nodePath === "") {
      return parentPath;
    }

    const parentQueryIndex = parentPath.indexOf("?");
    const nodeQueryIndex = nodePath.indexOf("?");

    if (parentQueryIndex !== -1) {
      const parentPathPart = parentPath.slice(0, parentQueryIndex);
      const parentQueryPart = parentPath.slice(parentQueryIndex + 1);

      if (nodeQueryIndex !== -1) {
        const nodePathPart = nodePath.slice(0, nodeQueryIndex);
        const nodeQueryPart = nodePath.slice(nodeQueryIndex + 1);

        return `${parentPathPart}${nodePathPart}?${parentQueryPart}&${nodeQueryPart}`;
      }

      return `${parentPathPart}${nodePath}?${parentQueryPart}`;
    }

    if (nodeQueryIndex !== -1) {
      const pathPart = nodePath.slice(0, nodeQueryIndex);
      const queryPart = nodePath.slice(nodeQueryIndex);

      return parentPath + pathPart + queryPart;
    }

    return parentPath + nodePath;
  }

  #convertToRou3Syntax(path: string): string {
    const queryIndex = path.indexOf("?");
    let pathPart = queryIndex === -1 ? path : path.slice(0, queryIndex);

    // eslint-disable-next-line sonarjs/slow-regex
    pathPart = pathPart.replaceAll(/<[^>]+>/g, "");

    pathPart = pathPart.replaceAll(/\*([^/?]+)/g, "**:$1");

    pathPart = pathPart.replaceAll(/\*(?=[/?]|$)/g, "**");

    return pathPart;
  }

  #parseQueryString(
    queryString: string,
    queryParamsOptions?: QueryParamsOptions,
  ): RouteParams {
    return parseQueryParams(queryString, queryParamsOptions) as RouteParams;
  }

  #hasRawUnicode(path: string): boolean {
    for (let i = 0; i < path.length; i++) {
      // codePointAt always returns number for valid indices; ?? 0 is defensive
      /* istanbul ignore next -- @preserve */
      if ((path.codePointAt(i) ?? 0) > 127) {
        return true;
      }
    }

    return false;
  }

  #appendSlashChild(segments: readonly RouteTree[]): readonly RouteTree[] {
    /* istanbul ignore if -- @preserve: defensive check, segments always has items when called */
    if (segments.length === 0) {
      return segments;
    }

    const lastSegment = segments.at(-1);

    /* istanbul ignore if -- @preserve: TypeScript narrowing, at(-1) is defined when length > 0 */
    if (!lastSegment) {
      return segments;
    }

    const slashChild = lastSegment.nonAbsoluteChildren.find(
      (child) => child.path !== "" && /^\/(\?|$)/.test(child.path),
    );

    if (slashChild) {
      return [...segments, slashChild];
    }

    return segments;
  }
}
