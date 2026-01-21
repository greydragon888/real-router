// packages/route-node/modules/parser/defaultParserFactory.ts

/**
 * Default path parser factory using path-parser library.
 *
 * @module defaultParserFactory
 */

import { Path } from "./path-parser";

import type { PathParser } from "../types";

/**
 * Factory interface for creating PathParser instances.
 */
export interface PathParserFactory {
  create: (path: string) => PathParser;
}

/**
 * Creates a PathParser instance.
 *
 * The Path class directly implements the PathParser interface,
 * eliminating wrapper overhead for better performance.
 *
 * @param path - The path pattern to parse
 * @returns PathParser instance
 */
function createPathParser(path: string): PathParser {
  return new Path(path);
}

/**
 * Default factory that creates PathParser instances.
 *
 * This factory wraps the path-parser library's Path class, providing
 * the standard implementation used by RouteNode.
 *
 * @example
 * ```typescript
 * import { defaultParserFactory } from "route-tree";
 *
 * const parser = defaultParserFactory.create("/users/:id");
 * parser.test("/users/123"); // { id: "123" }
 * ```
 */
export const defaultParserFactory: PathParserFactory = {
  create: createPathParser,
};
