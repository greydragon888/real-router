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
  RouteTreeStateMeta,
  URLParamsEncodingType,
} from "../operations/types";
import type { Options as QueryParamsOptions } from "search-params";

const RAW_UNICODE_PATTERN = /[\u0080-\uFFFF]/;

interface RouteData {
  /** Segments without root, WITH slashChild — for match() */
  readonly matchSegments: readonly RouteTree[];
  /** Segments without root, WITHOUT slashChild — for getSegmentsByName()/buildPath */
  readonly segments: readonly RouteTree[];
  readonly declaredQueryParams: readonly string[];
  readonly hasTrailingSlash: boolean;
  readonly hasConstraints: boolean;
  /** Pre-computed constraint patterns — avoids Map creation per match() */
  readonly constraintPatterns: ReadonlyMap<string, ConstraintPattern>;
  /** Pre-computed Set for strict query params mode — avoids Set creation per match() */
  readonly declaredQueryParamsSet: ReadonlySet<string>;
  /** Pre-computed meta (segment fullName → paramTypeMap) — avoids iteration per match() */
  readonly meta: Readonly<RouteTreeStateMeta>;
}

export class MatcherService implements IMatcherService {
  readonly #router = createRouter();
  readonly #routesByName = new Map<string, readonly RouteTree[]>();
  readonly #metaByName = new Map<string, Readonly<RouteTreeStateMeta>>();

  registerTree(node: RouteTree, parentPath = ""): void {
    const segments: RouteTree[] = [];

    this.#registerNode(node, parentPath, segments);
  }

  match(path: string, options?: MatchOptions): MatchResult | undefined {
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
    const strictTrailingSlash = options?.strictTrailingSlash ?? false;
    const pathWithoutQuery = strictTrailingSlash
      ? originalPathWithoutQuery
      : this.#normalizeTrailingSlash(originalPathWithoutQuery);

    const result = findRoute(this.#router, "GET", pathWithoutQuery);

    if (!result) {
      return undefined;
    }

    const data = result.data as RouteData;

    if (!this.#validateTrailingSlash(pathWithoutQuery, data, options)) {
      return undefined;
    }

    const params: RouteParams = result.params
      ? ({ ...result.params } as RouteParams)
      : {};

    this.#decodeUrlParams(params, options?.urlParamsEncoding ?? "default");

    if (
      data.hasConstraints &&
      !this.#validateRouteConstraints(
        params,
        data.constraintPatterns,
        originalPathWithoutQuery,
      )
    ) {
      return undefined;
    }

    if (queryString) {
      const success = this.#processQueryParams(
        params,
        queryString,
        data.declaredQueryParamsSet,
        options,
      );

      if (!success) {
        return undefined;
      }
    }

    return {
      segments: data.matchSegments,
      buildSegments: data.segments,
      params,
      meta: data.meta,
    };
  }

  getSegmentsByName(name: string): readonly RouteTree[] | undefined {
    return this.#routesByName.get(name);
  }

  getMetaByName(name: string): Readonly<RouteTreeStateMeta> | undefined {
    return this.#metaByName.get(name);
  }

  hasRoute(name: string): boolean {
    return this.#routesByName.has(name);
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
      const value = params[key];

      // rou3 always returns string params; check is defensive for type safety
      /* istanbul ignore else -- @preserve */
      if (typeof value === "string" && value.includes("%")) {
        params[key] = decoder(value);
      }
    }
  }

  #validateRouteConstraints(
    params: RouteParams,
    constraintPatterns: ReadonlyMap<string, ConstraintPattern>,
    path: string,
  ): boolean {
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
    declaredQueryParamsSet: ReadonlySet<string>,
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
    for (const key of Object.keys(allQueryParams)) {
      if (!declaredQueryParamsSet.has(key)) {
        return false;
      }
    }

    for (const key of declaredQueryParamsSet) {
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

      // Pre-filter: remove root segment (path === "") once at registration
      const filteredSegments = segments.filter((seg) => seg.path !== "");
      const frozenSegments = Object.freeze([...filteredSegments]);

      // Pre-compute slashChild (was done per-match in #appendSlashChild)
      const slashChild = this.#findSlashChild(filteredSegments);
      const frozenMatchSegments = slashChild
        ? Object.freeze([...filteredSegments, slashChild])
        : frozenSegments; // reuse same array when no slashChild

      // Pre-compute constraint patterns (was Map creation per match)
      const constraintPatterns =
        this.#collectConstraintPatterns(filteredSegments);

      // Pre-compute meta (was iteration per match in createRouteState)
      const meta: RouteTreeStateMeta = {};

      for (const segment of frozenMatchSegments) {
        meta[segment.fullName] = segment.paramTypeMap;
      }

      const routeData: RouteData = {
        matchSegments: frozenMatchSegments,
        segments: frozenSegments,
        declaredQueryParams,
        hasTrailingSlash,
        hasConstraints: constraintPatterns.size > 0,
        constraintPatterns,
        declaredQueryParamsSet: new Set(declaredQueryParams),
        meta: Object.freeze(meta),
      };

      this.#routesByName.set(node.fullName, frozenSegments);
      this.#metaByName.set(node.fullName, routeData.meta);
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
    return RAW_UNICODE_PATTERN.test(path);
  }

  /**
   * Finds a slash child (path "/" or "/?...") from the last segment's children.
   * Called once at registration time, not per-match.
   *
   * Limitation: only adds ONE level of slashChild. Nested slashChild
   * (slashChild with its own slashChild) is not supported.
   */
  #findSlashChild(
    filteredSegments: readonly RouteTree[],
  ): RouteTree | undefined {
    const lastSegment = filteredSegments.at(-1);

    /* v8 ignore next -- @preserve: defensive check, filteredSegments always has items when called */
    if (!lastSegment) {
      return undefined;
    }

    return lastSegment.nonAbsoluteChildren.find(
      (child) => child.path !== "" && /^\/(\?|$)/.test(child.path),
    );
  }
}
