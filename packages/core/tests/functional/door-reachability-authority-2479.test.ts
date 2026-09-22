import {
  globSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import * as ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * A door a message names must be one a caller can CALL, and one that can reach
 * the message (#2479).
 *
 * `message-prefix-authority-1845` asks whether a prefix is well SHAPED, so any
 * `router.<word>` passes it. Both defects this answers were well-shaped: #2461
 * printed `[router.clear]` for a door core names `clearRoutes`, and #2477 names
 * legacy verbs across two API families.
 *
 * ⚠ **The vocabulary is DERIVED, and never from what core prints.** #2457 adds
 * core's own printed prefixes to its alphabet, which is right for judging the
 * PLUGIN against core — and would make this authority validate itself. The four
 * sources here are what a caller can CALL: the facade's public methods and the
 * members of the four API interfaces.
 *
 * ⚠ **Membership, not call-graph reachability.** A graph keyed on names cannot
 * separate two functions that share one — `validatePlugin` is both a module
 * function and the namespace static that calls it — and it does not see dispatch
 * through an object. Measured: every one of its three reports was that artifact.
 * Membership catches both defects core shipped (#2461's `clear`, #2477's verbs),
 * and a check that prints artifacts is one people learn to ignore.
 */
const SRC = path.resolve(__dirname, "../../src");

/**
 * Doors named after core's own verb rather than the member a caller types, kept
 * because `@real-router/validation-plugin` prints the same two — measured, 18
 * `[router.addRoute]` and 10 `[router.updateRoute]` — and core's labels are
 * aligned with it ON PURPOSE, so that the no-plugin refusal matches the
 * with-plugin one (`guards.ts`, `getRoutesApi.ts`, `routesStore.ts` each say so).
 *
 * ⚠ Renaming core alone breaks that match, and `bare-core-message-parity`
 * (#1896) is what says so: it asserts the two builds produce one wording, word
 * for word. Measured — `removeRoute` is in this set because that test caught the
 * rename, not because a comment named it: the plugin builds that head from a door
 * LABEL, so grepping its source for the literal finds nothing. The set moves
 * together with the plugin or not at all.
 */
const ALIGNED_WITH_THE_PLUGIN: ReadonlySet<string> = new Set([
  "addRoute",
  "removeRoute",
  "updateRoute",
]);

const API_INTERFACES = new Set([
  "PluginApi",
  "RoutesApi",
  "LifecycleApi",
  "DependenciesApi",
]);

const parse = (file: string): ts.SourceFile =>
  ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TS,
  );

/** The head a message opens with, or undefined when it carries none. */
function headOf(node: ts.Expression): string | undefined {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }

  if (ts.isTemplateExpression(node)) {
    return node.head.text;
  }

  return ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.PlusToken
    ? headOf(node.left)
    : undefined;
}

/** The nearest enclosing named function, which is what a call graph keys on. */
function ownerOf(node: ts.Node): string | undefined {
  for (let at: ts.Node | undefined = node; at; at = at.parent) {
    if (ts.isFunctionDeclaration(at) && at.name) {
      return at.name.text;
    }

    if (
      (ts.isMethodDeclaration(at) || ts.isPropertyAssignment(at)) &&
      ts.isIdentifier(at.name)
    ) {
      return at.name.text;
    }

    if (
      ts.isVariableDeclaration(at) &&
      ts.isIdentifier(at.name) &&
      at.initializer !== undefined &&
      (ts.isArrowFunction(at.initializer) ||
        ts.isFunctionExpression(at.initializer))
    ) {
      return at.name.text;
    }
  }

  return undefined;
}

interface Facts {
  /**
   * Every door core recognises, including the ones a caller cannot call. Kept
   * for the width control only — judging against it is what let `clearRoutes`
   * through.
   */
  readonly vocabulary: ReadonlySet<string>;
  /**
   * **The public call surface: what a reader can type, and therefore what a door
   * may be named after.** `Router`'s public methods and the members of the four
   * API interfaces — nothing else.
   *
   * ⚠ A namespace method is not on it. `clearRoutes` lives only in
   * `RoutesNamespace`, and the caller types `getRoutesApi(router).clear()`.
   * ⚠ Nor is a check-position verb. `"addRoute:batch"` is published, and to a
   * plugin author REGISTERING a check — a different act, a different reader; the
   * positions themselves are untouched by this rule.
   *
   * It is also where the upward resolution stops, for the same reason: what a
   * caller can look up is the first PUBLIC name above the site.
   */
  readonly callable: ReadonlySet<string>;
  readonly heads: readonly {
    file: string;
    door: string;
    owner: string;
    /** Which surface printed it — both reach the same reader. */
    surface: "message" | "logger";
  }[];
}

interface Sink {
  readonly vocabulary: Set<string>;
  readonly callable: Set<string>;
}

/** A check position carries `door:slot`; a plugin author types it, a reader does not. */
function collectPosition(node: ts.Node, where: string, into: Sink): void {
  if (
    where === "internals.ts" &&
    ts.isPropertyAssignment(node) &&
    ts.isStringLiteral(node.initializer) &&
    node.initializer.text.includes(":")
  ) {
    const [door] = node.initializer.text.split(":", 1);

    into.vocabulary.add(door);
  }
}

/** The facade's methods are callable; a namespace's are recognised only. */
function collectClassMethods(node: ts.Node, into: Sink): void {
  if (!ts.isClassDeclaration(node) || node.name === undefined) {
    return;
  }

  const facade = node.name.text === "Router";

  if (!facade && !node.name.text.endsWith("Namespace")) {
    return;
  }

  for (const member of node.members) {
    if (
      (ts.isMethodDeclaration(member) || ts.isGetAccessor(member)) &&
      ts.isIdentifier(member.name)
    ) {
      into.vocabulary.add(member.name.text);

      if (facade) {
        into.callable.add(member.name.text);
      }
    }
  }
}

/** What a `get*Api` factory hands back, read off the interface it returns. */
function collectApiMembers(node: ts.Node, into: Sink): void {
  if (!ts.isInterfaceDeclaration(node) || !API_INTERFACES.has(node.name.text)) {
    return;
  }

  for (const member of node.members) {
    if (member.name !== undefined && ts.isIdentifier(member.name)) {
      into.vocabulary.add(member.name.text);
      into.callable.add(member.name.text);
    }
  }
}

/** `const at = raiser("router", "door")` — the head is the binding, not the throw. */
function collectRaiserDoor(
  node: ts.Node,
  source: ts.SourceFile,
  into: Map<string, string>,
): void {
  if (
    !ts.isVariableDeclaration(node) ||
    !ts.isIdentifier(node.name) ||
    node.initializer === undefined ||
    !ts.isCallExpression(node.initializer) ||
    node.initializer.expression.getText(source) !== "raiser"
  ) {
    return;
  }

  const [receiver, door] = node.initializer.arguments;

  if (
    receiver !== undefined &&
    ts.isStringLiteral(receiver) &&
    receiver.text === "router" &&
    door !== undefined &&
    ts.isStringLiteral(door)
  ) {
    into.set(node.name.text, door.text);
  }
}

/** Every text a construction hands out as a message, bag included. */
function messageTexts(node: ts.Node): (string | undefined)[] {
  if (!ts.isCallExpression(node) && !ts.isNewExpression(node)) {
    return [];
  }

  const texts: (string | undefined)[] = [];

  for (const argument of node.arguments ?? []) {
    texts.push(headOf(argument));

    if (ts.isObjectLiteralExpression(argument)) {
      for (const property of argument.properties) {
        if (
          ts.isPropertyAssignment(property) &&
          property.name.getText() === "message"
        ) {
          texts.push(headOf(property.initializer));
        }
      }
    }
  }

  return texts;
}

/**
 * The SECOND surface. `ctx.logger.warn("router.removeRoute", …)` is read by
 * whoever made the call, exactly as a refusal is, so the same rule binds it — and
 * the logger renders that label into the head the reader sees.
 */
function loggerDoor(node: ts.Node, source: ts.SourceFile): string | undefined {
  if (
    !ts.isCallExpression(node) ||
    !ts.isPropertyAccessExpression(node.expression) ||
    !["warn", "error", "info", "debug"].includes(node.expression.name.text) ||
    !/logger$/iu.test(node.expression.expression.getText(source))
  ) {
    return undefined;
  }

  const [label] = node.arguments;

  return label !== undefined &&
    (ts.isStringLiteral(label) || ts.isNoSubstitutionTemplateLiteral(label)) &&
    label.text.startsWith("router.")
    ? label.text.slice("router.".length)
    : undefined;
}

function readCore(root: string = SRC): Facts {
  const sink: Sink = { vocabulary: new Set(), callable: new Set() };
  const heads: Facts["heads"][number][] = [];

  for (const file of globSync(`${root}/**/*.ts`)) {
    const source = parse(file);
    const where = path.relative(root, file);
    const bound = new Map<string, string>();

    const visit = (node: ts.Node): void => {
      collectPosition(node, where, sink);
      collectClassMethods(node, sink);
      collectApiMembers(node, sink);
      collectRaiserDoor(node, source, bound);

      for (const text of messageTexts(node)) {
        const printed =
          text === undefined ? null : /^\[router\.([A-Za-z]+)\]/u.exec(text);
        const owner = ownerOf(node);

        if (printed !== null && owner !== undefined) {
          heads.push({
            file: where,
            door: printed[1],
            owner,
            surface: "message",
          });
        }
      }

      const label = loggerDoor(node, source);
      const owner = ownerOf(node);

      if (label !== undefined && owner !== undefined) {
        heads.push({ file: where, door: label, owner, surface: "logger" });
      }

      ts.forEachChild(node, visit);
    };

    visit(source);

    for (const door of bound.values()) {
      heads.push({ file: where, door, owner: "", surface: "message" });
    }
  }

  return { vocabulary: sink.vocabulary, callable: sink.callable, heads };
}

describe("a door a message names is one a caller can call (#2479)", () => {
  const facts = readCore();

  it("every door core NAMES is one a caller can call", () => {
    const outside = [
      ...new Set(
        facts.heads
          .filter(
            (head) =>
              !facts.callable.has(head.door) &&
              !ALIGNED_WITH_THE_PLUGIN.has(head.door),
          )
          .map((head) => `${head.file} · ${head.door} (${head.surface})`),
      ),
    ].toSorted((left, right) => left.localeCompare(right));

    expect(outside).toStrictEqual([]);
  });

  it("CONTROL — the vocabulary is wide enough to mean something, and derived", () => {
    // Anti-vacuum in both directions: a derivation that found nothing would
    // admit nothing, and one that swallowed core's own printed prefixes would
    // admit everything.
    expect(facts.vocabulary.size).toBeGreaterThan(100);
    expect(facts.heads.length).toBeGreaterThan(15);
    expect(facts.vocabulary.has("Segment Matcher")).toBe(false);
  });

  it("CONTROL — a planted door outside the vocabulary is found", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "door-reach-"));

    try {
      writeFileSync(
        path.join(directory, "internals.ts"),
        'export const POSITION = { "navigate:entry": "navigate:entry" };\n',
      );
      writeFileSync(
        path.join(directory, "planted.ts"),
        "function inner() {\n" +
          "  throw new TypeError(`[router.nosuchdoor] boom`);\n" +
          "}\n",
      );
      writeFileSync(
        path.join(directory, "honest.ts"),
        "function other() {\n" +
          "  throw new TypeError(`[router.navigate] boom`);\n" +
          "}\n",
      );

      const planted = readCore(directory);

      expect(
        planted.heads
          .filter((head) => !planted.vocabulary.has(head.door))
          .map((head) => `${head.file} · ${head.door}`),
      ).toStrictEqual(["planted.ts · nosuchdoor"]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
