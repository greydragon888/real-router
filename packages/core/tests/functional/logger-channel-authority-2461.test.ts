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
 * A logger channel names something the caller can look up (#2461).
 *
 * The context string is the first argument of every `logger.*` call and reaches a
 * consumer verbatim: `RouterLogger` prints it as `[context] message`, and an
 * application filtering its own logs filters on exactly this. So it answers the
 * same question #1845 asked of throw prefixes, and takes the same two answers —
 * the door the caller typed, or the bare facade where several doors reach one
 * raiser.
 *
 * ⚠ **The vocabulary is the DOOR, not the method.** Core names the routes-API
 * doors `addRoute` / `updateRoute` / `removeRoute` / `clearRoutes` while the
 * methods are `add` / `update` / `remove` / `clear` — measured, `[router.addRoute]`
 * appears twenty times and `[router.updateRoute]` ten. A channel that used the
 * method name instead would be the odd one out, so this authority polices the
 * SHAPE (`router` or `router.<name>`) and leaves the vocabulary to #1845's walk.
 */
const SRC = path.resolve(__dirname, "../../src");

/**
 * Levels `RouterLogger` publishes; the first argument of each is the channel.
 *
 * ⚠ Read off the class, not off the habit of other loggers: it has no `info`,
 * `debug` or `trace`, and it does have `log`. A set written from memory carried
 * the three it lacks and missed the one it has, which is a hole rather than a
 * harmless superset — a `logger.log("Router", …)` would have been invisible here.
 */
const LEVELS: ReadonlySet<string> = new Set(["log", "warn", "error"]);

/**
 * The same set, read off `RouterLogger`: a method taking `(context, message, …)`.
 *
 * `configure` and `getConfig` take neither, which is what separates a level from
 * the rest of the class without naming the three in a second place.
 */
function levelsOfRouterLogger(): Set<string> {
  const file = path.join(SRC, "utils/logger/RouterLogger.ts");
  const source = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TS,
  );
  const found = new Set<string>();

  const visit = (node: ts.Node): void => {
    if (
      ts.isMethodDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.parameters.length >= 2 &&
      node.parameters
        .slice(0, 2)
        .every(
          (parameter) => parameter.type?.kind === ts.SyntaxKind.StringKeyword,
        ) &&
      ts.isIdentifier(node.parameters[0].name) &&
      node.parameters[0].name.text === "context"
    ) {
      found.add(node.name.text);
    }

    ts.forEachChild(node, visit);
  };

  visit(source);

  return found;
}

/**
 * Tier one: the facade, bare or with a door.
 *
 * ⚠ Named predicates below rather than inline `/…/.test(…)`, and not for style:
 * `vitest/no-conditional-tests` reads a `.test(` call inside an `if` as the
 * vitest global `test()` in a conditional and reds the file — the lesson
 * `repo-scan-authority-2241` and `canonical-brand-authority-1968` record.
 */
const PUBLISHED = /^router(\.[A-Za-z]+)?$/u;

const namesTheFacade = (channel: string): boolean => PUBLISHED.test(channel);
const isLoggerReceiver = (text: string): boolean => /logger$/iu.test(text);

interface Channel {
  readonly file: string;
  readonly line: number;
  readonly channel: string;
}

interface Census {
  readonly offenders: Channel[];
  /** Literal channels seen at all — the anti-vacuum floor. */
  readonly literals: number;
  /** Calls whose channel is an identifier, so unjudgeable at the call site. */
  readonly computed: number;
  /**
   * Module-level `const …CONTEXT | …CTX = "channel"`, judged where it is written.
   *
   * ⚠ This is why they are judged at the DECLARATION: `LOGGER_CONTEXT` is
   * imported across files, so the call site holds an identifier and resolving it
   * would need a `ts.Program`. Judged here, a rename to a class name is caught
   * wherever it is passed.
   */
  readonly constants: number;
}

/**
 * The static skeleton of a channel: `` `router.${name}` `` reads `router.\u{1}`.
 *
 * A template is a channel too — `` `router.${methodName}` `` is how the lifecycle
 * doors name themselves — and the shape holds with the hole in the door position.
 */
const HOLE = "\u{1}";

const skeletonOf = (node: ts.TemplateExpression): string =>
  node.head.text +
  node.templateSpans.map((span) => HOLE + span.literal.text).join("");

/**
 * The hole stands in for a name, so it is judged as one rather than admitted by a
 * second pattern: `router.\u{1}` reads `router.x`, and the one shape above rules.
 */
const namesTheFacadeOrDoor = (skeleton: string): boolean =>
  namesTheFacade(skeleton.replaceAll(HOLE, "x"));

const isContextConstant = (name: string): boolean =>
  /(CONTEXT|CTX)$/u.test(name);

/**
 * Every `logger.<level>(channel, …)` in core, judged on its channel.
 *
 * ⚠ The receiver is filtered, not assumed: `logger` / `ctx.logger` / `#logger`
 * are the sink, and a text scan that took every `.warn(` would count an
 * `EventEmitter` or a `console` call as a channel.
 */
function census(root: string = SRC): Census {
  const offenders: Channel[] = [];
  let literals = 0;
  let computed = 0;
  let constants = 0;

  for (const file of globSync(`${root}/**/*.ts`)) {
    const source = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      /* setParentNodes */ true,
      ts.ScriptKind.TS,
    );

    const at = (node: ts.Node, channel: string): void => {
      offenders.push({
        file: path.relative(root, file),
        line:
          source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
        channel,
      });
    };

    const judgeCall = (node: ts.CallExpression): void => {
      const first = node.arguments[0];

      if (first === undefined) {
        return;
      }

      if (
        ts.isStringLiteral(first) ||
        ts.isNoSubstitutionTemplateLiteral(first)
      ) {
        literals++;

        if (!namesTheFacade(first.text)) {
          at(node, first.text);
        }

        return;
      }

      if (ts.isTemplateExpression(first)) {
        literals++;

        const skeleton = skeletonOf(first);

        if (!namesTheFacadeOrDoor(skeleton)) {
          at(node, skeleton);
        }

        return;
      }

      computed++;
    };

    const judgeConstant = (node: ts.VariableDeclaration): void => {
      if (
        !ts.isIdentifier(node.name) ||
        !isContextConstant(node.name.text) ||
        node.initializer === undefined ||
        !ts.isStringLiteral(node.initializer)
      ) {
        return;
      }

      constants++;

      if (!namesTheFacade(node.initializer.text)) {
        at(node, node.initializer.text);
      }
    };

    const visit = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        LEVELS.has(node.expression.name.text) &&
        isLoggerReceiver(node.expression.expression.getText(source))
      ) {
        judgeCall(node);
      }

      if (ts.isVariableDeclaration(node)) {
        judgeConstant(node);
      }

      ts.forEachChild(node, visit);
    };

    visit(source);
  }

  return { offenders, literals, computed, constants };
}

describe("a logger channel names something the caller can look up (#2461)", () => {
  it("no channel in core names a class, a package, or anything else", () => {
    expect(census().offenders).toStrictEqual([]);
  });

  it("CONTROL — the level set is the class's, not a set written from memory", () => {
    // The hand-written set carried `info` / `debug` / `trace`, which the class does
    // not publish, and missed `log`, which it does — so a `logger.log("Router", …)`
    // was structurally invisible to the walk above. Derived, it cannot drift again.
    expect(levelsOfRouterLogger()).toStrictEqual(new Set(LEVELS));
  });

  it("CONTROL — the walk reads channels at all", () => {
    // An empty offender list is what a working walk and a broken one both
    // produce, so the floor is what tells them apart. It sits under the CALL
    // count, not the count of distinct channels.
    //
    // ⚠ `computed` gets no floor here on purpose: a counter that only increments
    // cannot fail a `>= 0`, and such an assertion reads as coverage while being a
    // comment with `expect()` around it. The synthetic tree below pins its value.
    expect(census().literals).toBeGreaterThan(12);
  });

  it("CONTROL — both polarities, on a tree written for the purpose", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "channel-"));

    try {
      writeFileSync(
        path.join(directory, "bad.ts"),
        'logger.warn("Router", "names the class");\n',
      );
      writeFileSync(
        path.join(directory, "bare.ts"),
        'logger.error("router", "the facade, where several doors reach one raiser");\n',
      );
      writeFileSync(
        path.join(directory, "door.ts"),
        'ctx.logger.warn("router.isActiveRoute", "a door the caller typed");\n',
      );
      // Not a channel: the receiver is not a logger.
      writeFileSync(
        path.join(directory, "not-a-logger.ts"),
        'emitter.warn("Router", "this is someone else\'s first argument");\n',
      );
      // Not judgeable: the channel is computed.
      writeFileSync(
        path.join(directory, "computed.ts"),
        'logger.warn(contextOf(node), "built at runtime");\n',
      );
      // A template with the hole in the door position holds the shape; the same
      // template naming a class does not.
      writeFileSync(
        path.join(directory, "template.ts"),
        "logger.warn(`router.${methodName}`, 'a door named at runtime');\n" +
          "logger.warn(`Router.${methodName}`, 'a class named at runtime');\n",
      );
      // Judged where it is written, because the call site only holds the name.
      writeFileSync(
        path.join(directory, "constants.ts"),
        'export const LOGGER_CONTEXT = "router.usePlugin";\n' +
          'const OTHER_CTX = "RouterInternals";\n' +
          'const NOT_A_CHANNEL = "Router";\n',
      );

      const seen = census(directory);

      // Sorted, because the file order of a directory walk is the platform's.
      expect(
        seen.offenders.toSorted((a, b) => a.file.localeCompare(b.file)),
      ).toStrictEqual([
        { file: "bad.ts", line: 1, channel: "Router" },
        { file: "constants.ts", line: 2, channel: "RouterInternals" },
        { file: "template.ts", line: 2, channel: `Router.${HOLE}` },
      ]);
      expect(seen.literals).toBe(5);
      expect(seen.computed).toBe(1);
      // `NOT_A_CHANNEL = "Router"` is not one: the name test is what keeps this
      // walk from judging every string constant in core.
      expect(seen.constants).toBe(2);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
