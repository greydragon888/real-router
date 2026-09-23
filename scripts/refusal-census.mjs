/**
 * Refusal census for the refusal surface (#2487).
 *
 * It COUNTS and prints; nothing gates on it. The judgements live in
 * `message-prefix-authority-1845` and `prefix-reachability-authority-2457`.
 *
 * PREDICATE — constructive: a bracketed head that reaches a caller, wherever it
 * is WRITTEN. Three writing positions, because a throw-site predicate loses 11
 * refusals the design must convert:
 *
 *   1. a constructor's first argument — `new TypeError("[router.x] …")`
 *   2. a `RouterError` options bag — `new RouterError(code, { message: "[router.x] …" })`
 *   3. a variable a bag consumes  — `phase = "[router] …"` … `{ message: phase }`
 *
 * The DELIVERY channel (thrown here / rejected / thrown elsewhere) is an axis,
 * not part of the predicate.
 *
 * Run from the repository root: `node scripts/refusal-census.mjs`
 */

import ts from "typescript";
import { globSync, readFileSync } from "node:fs";

import { raiserPartsAt, raiserTagOf } from "./lib/raiser-head.mjs";

const ROOTS = ["packages/core/src", "packages/validation-plugin/src"];
const CONSTRUCTORS = new Set([
  "TypeError",
  "Error",
  "RangeError",
  "ReferenceError",
  "RouterError",
]);

/** `[dynamic]` is an ordinary value, not a prefix — #1845 states this. */
const NOT_A_PREFIX = new Set(["[dynamic]"]);

const leftmost = (node) => {
  let inner = node;

  while (
    ts.isBinaryExpression(inner) &&
    inner.operatorToken.kind === ts.SyntaxKind.PlusToken
  ) {
    inner = inner.left;
  }

  return inner;
};

/** The head a reader sees, or undefined when the expression carries none. */
/** What each raiser flavour constructs, so a tag counts as its class. */
const FLAVOUR_CLASS = {
  type: "TypeError",
  plain: "Error",
  ref: "ReferenceError",
  range: "RangeError",
  code: "RouterError",
};

/** The head a binding's parts build, or `undefined` if it names no receiver. */
const headOf = (parts) => {
  if (parts?.receiver === undefined) {
    return undefined;
  }

  if (parts.dynamic) {
    // A dynamic door is spelled as the literal form spelled it, so the counts a
    // conversion moves stay comparable across it.
    return `[${parts.receiver}.\${}] `;
  }

  return parts.door === undefined
    ? `[${parts.receiver}] `
    : `[${parts.receiver}.${parts.door}] `;
};

/** The flavour and head a raiser tag carries, if `node` is one. */
export const raiserTag = (node) => {
  const tag = raiserTagOf(node);
  const flavour = tag === undefined ? undefined : FLAVOUR_CLASS[tag.member];
  const head =
    flavour === undefined ? undefined : headOf(raiserPartsAt(node, tag.base));

  return head === undefined ? undefined : { flavour, head };
};

const headOfExpression = (node) => {
  if (node === undefined) return undefined;

  const leaf = leftmost(node);

  if (ts.isStringLiteral(leaf) || ts.isNoSubstitutionTemplateLiteral(leaf)) {
    return leaf.text;
  }

  return ts.isTemplateExpression(leaf) ? leaf.head.text : undefined;
};

const isClosedBracket = (head) =>
  head !== undefined &&
  head.startsWith("[") &&
  head.includes("]") &&
  !NOT_A_PREFIX.has(head.trim());

/** `new RouterError(code, { message })` keeps the message in the BAG only. */
const bagMessage = (args) => {
  for (const argument of args) {
    if (!ts.isObjectLiteralExpression(argument)) continue;

    for (const property of argument.properties) {
      if (
        ts.isPropertyAssignment(property) &&
        property.name.getText() === "message"
      ) {
        return property.initializer;
      }
    }
  }

  return undefined;
};

/** Where the error goes: thrown at the construction site, or somewhere else. */
const deliveryOf = (node) => {
  let parent = node.parent;

  while (parent !== undefined) {
    if (ts.isThrowStatement(parent)) return "thrown here";
    if (
      ts.isCallExpression(parent) &&
      /Promise\.reject$/u.test(parent.expression.getText())
    ) {
      return "rejected";
    }
    parent = parent.parent;
  }

  return "constructed here, delivered elsewhere";
};

function main() {
  const rows = [];
  const receiverOf = (head) => /^\[([^\].]+)/u.exec(head)?.[1] ?? "?";

  for (const root of ROOTS) {
    for (const file of globSync(`${root}/**/*.ts`)) {
      const text = readFileSync(file, "utf8");
      const source = ts.createSourceFile(
        file,
        text,
        ts.ScriptTarget.Latest,
        /* setParentNodes */ true,
        ts.ScriptKind.TS,
      );
      const relative = file.replace(/^packages\/[^/]+\/src\//u, "");
      const at = (node) =>
        source.getLineAndCharacterOfPosition(node.getStart()).line + 1;

      /** Position 3: a bracketed literal whose variable a bag later consumes. */
      const variableFed = [];

      const walk = (node) => {
        if (
          ts.isNewExpression(node) &&
          CONSTRUCTORS.has(node.expression.getText())
        ) {
          const constructor = node.expression.getText();
          const args = node.arguments ?? [];
          const fromBag = bagMessage(args);
          const message =
            fromBag ?? (constructor === "RouterError" ? undefined : args[0]);
          const head = headOfExpression(message);

          if (isClosedBracket(head)) {
            rows.push({
              package: root.includes("/core/") ? "core" : "plugin",
              site: `${relative}:${at(node)}`,
              constructor,
              receiver: receiverOf(head),
              inside: /^\[([^\]]+)\]/u.exec(head)?.[1] ?? "?",
              position: fromBag ? "bag" : "argument",
              form: ts.isBinaryExpression(message)
                ? "concatenation"
                : ts.isTemplateExpression(message)
                  ? "template"
                  : "plain",
              delivery: deliveryOf(node),
            });
          }
        }

        const tag = raiserTag(node);

        if (tag !== undefined) {
          rows.push({
            package: root.includes("/core/") ? "core" : "plugin",
            site: `${relative}:${at(node)}`,
            constructor: tag.flavour,
            receiver: receiverOf(tag.head),
            inside: /^\[([^\]]+)\]/u.exec(tag.head)?.[1] ?? "?",
            // The message is the TAG's template: neither a constructor argument nor
            // a bag, and saying so keeps the position tally honest across the
            // conversion rather than folding the new shape into an old name.
            position: "tag",
            form: ts.isNoSubstitutionTemplateLiteral(node.template)
              ? "plain"
              : "template",
            delivery: deliveryOf(node),
          });
        }

        if (
          (ts.isStringLiteral(node) ||
            ts.isNoSubstitutionTemplateLiteral(node) ||
            ts.isTemplateExpression(node)) &&
          isClosedBracket(headOfExpression(node)) &&
          ts.isVariableDeclaration(node.parent) === false
        ) {
          // An assignment to a declared name: `phase = "[router] …"`.
          const parent = node.parent;

          if (
            ts.isBinaryExpression(parent) &&
            parent.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
            ts.isIdentifier(parent.left)
          ) {
            variableFed.push({
              name: parent.left.text,
              site: `${relative}:${at(node)}`,
              head: headOfExpression(node),
            });
          }
        }

        ts.forEachChild(node, walk);
      };

      walk(source);

      // Keep only the variables a `message:` actually consumes, in this file.
      for (const candidate of variableFed) {
        if (!new RegExp(`message:\\s*${candidate.name}\\b`, "u").test(text)) {
          continue;
        }

        rows.push({
          package: root.includes("/core/") ? "core" : "plugin",
          site: candidate.site,
          constructor: "RouterError",
          receiver: receiverOf(candidate.head),
          inside: /^\[([^\]]+)\]/u.exec(candidate.head)?.[1] ?? "?",
          position: "variable a bag consumes",
          form: "plain",
          delivery: "constructed here, delivered elsewhere",
        });
      }
    }
  }

  const tally = (key, of = rows) =>
    of.reduce(
      (seen, row) => ({ ...seen, [row[key]]: (seen[row[key]] ?? 0) + 1 }),
      {},
    );

  const thrownHere = rows.filter((row) => row.delivery === "thrown here");
  const elsewhere = rows.filter((row) => row.delivery !== "thrown here");

  // ⚠ An ANTI-VACUUM line, and the reason it exists is measured: this script read
  // `5` for a while after the conversion landed — it knew only the literal form, and
  // nothing compared its output to an independent count, so the drift was silent.
  // `throw` statements are that count; they cannot fall while refusals exist.
  let thrownInRoots = 0;

  for (const root of ROOTS) {
    for (const file of globSync(`${root}/**/*.ts`)) {
      const source = ts.createSourceFile(
        file,
        readFileSync(file, "utf8"),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
      );
      const walk = (node) => {
        if (ts.isThrowStatement(node)) thrownInRoots += 1;

        ts.forEachChild(node, walk);
      };

      walk(source);
    }
  }

  console.log(`REFUSALS with a bracketed head: ${rows.length}\n`);
  console.log(
    `  against ${thrownInRoots} \`throw\` statements in the same roots — a head count far`,
  );
  console.log(
    "  below this one means a form went unread, not that the refusals left.\n",
  );
  console.log("by delivery:  ", tally("delivery"));
  console.log("by position:  ", tally("position"));
  console.log("by constructor:", tally("constructor"));
  console.log("by receiver:  ", tally("receiver"));
  console.log("by form:      ", tally("form"));

  // О-2's subject: a head that names its receiver and no door.
  const bare = rows.filter(
    (row) => (row.inside ?? row.receiver) === row.receiver,
  );

  console.log(
    `\nBARE heads — receiver alone, no door: ${bare.length} of ${rows.length}`,
  );
  console.log("  by receiver:", tally("receiver", bare));

  console.log(
    `\nAxes across the ${thrownHere.length} thrown at the construction site:`,
  );
  console.log("  constructor:", tally("constructor", thrownHere));
  console.log("  receiver:   ", tally("receiver", thrownHere));
  console.log("  form:       ", tally("form", thrownHere));

  console.log(
    `\nThe ${elsewhere.length} a throw-site predicate would LOSE — the reason this census is constructive:`,
  );
  for (const row of elsewhere) {
    console.log(`  ${row.site.padEnd(58)} ${row.delivery}  (${row.position})`);
  }

  const inBag = rows.filter((row) => row.position === "bag");
  console.log(
    `\nHeads written in a RouterError options bag: ${inBag.length}, of which ${
      inBag.filter((row) => row.delivery === "thrown here").length
    } are thrown at the site. Since #2501 the authority reads both this shape and a`,
  );
  console.log(
    "construction outside a throw, so these are judged like any other.",
  );

  // ── The numbers the design quotes, each under its own predicate ─────────────

  console.log(
    "\n── every throw NOT in the in-set, by shape (О-10's completeness check) ──",
  );

  const outside = {};
  let allThrows = 0;
  const inSet = new Set(thrownHere.map((row) => row.site));

  for (const root of ROOTS) {
    for (const file of globSync(`${root}/**/*.ts`)) {
      const source = ts.createSourceFile(
        file,
        readFileSync(file, "utf8"),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
      );
      const relative = file.replace(/^packages\/[^/]+\/src\//u, "");
      const bump = (k) => {
        outside[k] = (outside[k] ?? 0) + 1;
      };

      const walk = (node) => {
        if (ts.isThrowStatement(node)) {
          allThrows++;

          const line =
            source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
          const expression = node.expression;
          let carrier = expression;

          if (ts.isCallExpression(expression)) {
            carrier =
              expression.arguments.find((a) => ts.isNewExpression(a)) ??
              expression;
          }

          const site = ts.isNewExpression(carrier)
            ? `${relative}:${source.getLineAndCharacterOfPosition(carrier.getStart()).line + 1}`
            : `${relative}:${line}`;

          if (inSet.has(site)) return ts.forEachChild(node, walk);

          if (ts.isIdentifier(expression)) bump("a rethrow");
          else if (
            ts.isCallExpression(expression) &&
            !ts.isNewExpression(carrier)
          )
            bump(
              `through a helper: ${expression.expression.getText().slice(0, 34)}`,
            );
          else if (ts.isNewExpression(carrier)) {
            const head = headOfExpression(
              bagMessage(carrier.arguments ?? []) ??
                (carrier.arguments ?? [])[0],
            );
            if (head === undefined)
              bump("a construction whose message is not in the tree");
            else if (!head.startsWith("["))
              bump("a construction with no bracket");
            else
              bump(
                "a construction whose head opens [ and never closes (dynamic door)",
              );
          } else bump("another shape");
        }

        ts.forEachChild(node, walk);
      };

      walk(source);
    }
  }

  const outsideTotal = Object.values(outside).reduce((a, b) => a + b, 0);
  console.log(
    `${allThrows} throws in all; ${inSet.size} are the in-set, ${outsideTotal} are not:`,
  );
  for (const [shape, count] of Object.entries(outside).sort(
    (a, b) => b[1] - a[1],
  )) {
    console.log(`  ${String(count).padStart(3)}  ${shape}`);
  }

  console.log(
    "\n── extras, bindings, weight ──────────────────────────────────",
  );

  const bagKeys = {};
  const extras = { errorCodes: 0, cause: 0, otherBagKeys: 0 };
  const bindings = new Set();
  const bindingsWithDoor = new Set();
  const perFile = {};
  let mutatedBeforeDelivery = 0;

  for (const root of ROOTS) {
    for (const file of globSync(`${root}/**/*.ts`)) {
      const text = readFileSync(file, "utf8");
      const source = ts.createSourceFile(
        file,
        text,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
      );
      const relative = file.replace(/^packages\/[^/]+\/src\//u, "");

      const walk = (node) => {
        if (
          ts.isNewExpression(node) &&
          CONSTRUCTORS.has(node.expression.getText())
        ) {
          const args = node.arguments ?? [];
          const head = headOfExpression(bagMessage(args) ?? args[0]);

          if (isClosedBracket(head)) {
            perFile[relative] = (perFile[relative] ?? 0) + 1;
            const inside = /^\[([^\]]+)\]/u.exec(head)?.[1] ?? "?";

            bindings.add(`${relative}::${inside.split(".")[0]}`);
            bindingsWithDoor.add(`${relative}::${inside}`);
          }

          if (/errorCodes\./u.test(node.getText())) extras.errorCodes++;

          for (const argument of args) {
            if (!ts.isObjectLiteralExpression(argument)) continue;

            for (const property of argument.properties) {
              const key =
                ts.isPropertyAssignment(property) ||
                ts.isShorthandPropertyAssignment(property)
                  ? property.name.getText()
                  : undefined;

              if (key === undefined || key === "message") continue;
              if (key === "cause") {
                extras.cause++;
                continue;
              }

              extras.otherBagKeys++;
              bagKeys[key] = (bagKeys[key] ?? 0) + 1;
            }
          }

          // The `CONFIG_FAULT` shape: built, then given a property before delivery.
          if (
            ts.isVariableDeclaration(node.parent) &&
            ts.isIdentifier(node.parent.name) &&
            new RegExp(
              `${node.parent.name.text}\\.[A-Za-z]+\\s*=|Object\\.assign\\(\\s*${node.parent.name.text}`,
              "u",
            ).test(text)
          ) {
            mutatedBeforeDelivery++;
          }
        }

        ts.forEachChild(node, walk);
      };

      walk(source);
    }
  }

  console.log(
    "extras, over EVERY construction of the five (not only the bracketed ones):",
    extras,
  );
  console.log("bag keys beyond `message`, same denominator:", bagKeys);
  const bindingFiles = new Set(
    thrownHere.map((row) => row.site.replace(/:\d+$/u, "")),
  );
  const byReceiver = new Set(
    thrownHere.map(
      (row) => `${row.site.replace(/:\d+$/u, "")}::${row.receiver}`,
    ),
  );
  const byDoor = new Set(
    thrownHere.map(
      (row) =>
        `${row.site.replace(/:\d+$/u, "")}::${row.inside ?? row.receiver}`,
    ),
  );

  console.log(
    `bindings across the ${thrownHere.length} thrown refusals, in ${bindingFiles.size} files: ${byReceiver.size} as file × RECEIVER, ${byDoor.size} as file × receiver × DOOR.`,
  );
  console.log(
    `  the shrink \u041e-9 claims, against the second: ${(thrownHere.length / byDoor.size).toFixed(1)}\u00d7`,
  );
  console.log(
    '⚠ \u041e-9\'s claim is about the second: `raiser("router", "navigate")` binds a door, so',
  );
  console.log("  that is the number the shrink should be quoted against.");
  console.log(
    "built then mutated before delivery (the tag shape):",
    mutatedBeforeDelivery,
  );
  console.log("heaviest files:");
  for (const [file, count] of Object.entries(perFile)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)) {
    console.log(`  ${String(count).padStart(3)}  ${file}`);
  }

  console.log(
    "\n── the factory story, per package ────────────────────────────",
  );

  for (const root of ROOTS) {
    const label = root.includes("/core/") ? "core  " : "plugin";
    let handWritten = 0;
    let verbatim = 0;
    let factoryCalls = 0;

    for (const file of globSync(`${root}/**/*.ts`)) {
      const source = ts.createSourceFile(
        file,
        readFileSync(file, "utf8"),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
      );

      const walk = (node) => {
        if (
          ts.isCallExpression(node) &&
          node.expression.getText() === "createRouterError"
        ) {
          factoryCalls++;
        }

        if (
          ts.isNewExpression(node) &&
          CONSTRUCTORS.has(node.expression.getText())
        ) {
          const constructor = node.expression.getText();
          const args = node.arguments ?? [];
          const head = headOfExpression(bagMessage(args) ?? args[0]);

          if (isClosedBracket(head) || /^\[router\./u.test(head ?? "")) {
            handWritten++;

            const body = node.getText();

            if (
              constructor === "TypeError" &&
              /^\[router\./u.test(head ?? "") &&
              args.length === 1 &&
              !/\bcause\s*:/u.test(body) &&
              !/errorCodes\./u.test(body)
            ) {
              verbatim++;
            }
          }
        }

        ts.forEachChild(node, walk);
      };

      walk(source);
    }

    console.log(
      `${label}: ${handWritten} hand-written bracketed refusals · ${verbatim} expressible by the factory verbatim (a TypeError, a [router.…] head, one argument, no extras) · ${factoryCalls} factory call sites`,
    );
  }

  console.log(
    "\n── the freeze obligation ─────────────────────────────────────",
  );

  /**
   * A `RouterError` reaches a caller by two written shapes, and counting only the
   * first is what let #2503 live: `throw … new RouterError(…)`, and
   * `throw <helper>()` where the helper's declared return type IS `RouterError`.
   */
  const helpersReturningRouterError = new Set();

  for (const root of ROOTS) {
    for (const file of globSync(`${root}/**/*.ts`)) {
      const source = ts.createSourceFile(
        file,
        readFileSync(file, "utf8"),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
      );

      const walk = (node) => {
        const returns = node.type?.getText?.();

        if (
          (ts.isMethodDeclaration(node) || ts.isFunctionDeclaration(node)) &&
          returns === "RouterError" &&
          node.name !== undefined
        ) {
          helpersReturningRouterError.add(node.name.getText());
        }

        ts.forEachChild(node, walk);
      };

      walk(source);
    }
  }

  const freeze = {
    direct: 0,
    directFrozen: 0,
    viaHelper: 0,
    viaHelperFrozen: 0,
    raised: 0,
  };

  for (const root of ROOTS) {
    for (const file of globSync(`${root}/**/*.ts`)) {
      const source = ts.createSourceFile(
        file,
        readFileSync(file, "utf8"),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
      );

      const walk = (node) => {
        if (ts.isThrowStatement(node)) {
          const body = node.getText();
          const frozenHere = /freezeThrownError\(/u.test(body);

          const tag = raiserTag(node.expression);

          if (tag?.flavour === "RouterError") {
            // A THIRD written shape, and it needs no wrapper: `code()` calls
            // `freezeThrownError` itself. Counted so the two rows below stay a
            // statement about the shapes that DO need one, rather than a
            // denominator that shrank as the conversion moved sites out of them.
            freeze.raised++;
          } else if (/new RouterError\(/u.test(body)) {
            freeze.direct++;

            if (frozenHere) freeze.directFrozen++;
          } else if (
            [...helpersReturningRouterError].some((name) =>
              body.includes(`${name}(`),
            )
          ) {
            freeze.viaHelper++;

            if (frozenHere) freeze.viaHelperFrozen++;
          }
        }

        ts.forEachChild(node, walk);
      };

      walk(source);
    }
  }

  console.log(
    `built at the throw:   ${freeze.directFrozen} of ${freeze.direct} frozen`,
  );
  console.log(
    `built by a helper:    ${freeze.viaHelperFrozen} of ${freeze.viaHelper} frozen  (helpers declared \`: RouterError\`: ${helpersReturningRouterError.size})`,
  );
  console.log(
    `built by the raiser:  ${freeze.raised} of ${freeze.raised} frozen by construction`,
  );
  console.log(
    "⚠ The second row is the shape #2503 lived in: counting the first alone read the",
  );
  console.log(
    "  same number before that defect and after its fix. The third needs no wrapper,",
  );
  console.log(
    "  and is counted so the first two stay a claim about shapes that do.",
  );

  console.log(
    "\n── О-10's categories, counted ────────────────────────────────",
  );

  const categories = {
    "code-only, literal errorCodes.X": 0,
    "code-only, a VARIABLE code": 0,
    "re-freezing an already-built error": 0,
    "the message is chosen by a ternary": 0,
  };

  for (const root of ROOTS) {
    for (const file of globSync(`${root}/**/*.ts`)) {
      const source = ts.createSourceFile(
        file,
        readFileSync(file, "utf8"),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
      );

      const walk = (node) => {
        if (
          ts.isNewExpression(node) &&
          node.expression.getText() === "RouterError"
        ) {
          const args = node.arguments ?? [];

          if (bagMessage(args) === undefined) {
            categories[
              /^errorCodes\./u.test(args[0]?.getText() ?? "")
                ? "code-only, literal errorCodes.X"
                : "code-only, a VARIABLE code"
            ]++;
          }
        }

        if (ts.isThrowStatement(node)) {
          const expression = node.expression;

          if (
            ts.isCallExpression(expression) &&
            /freezeThrownError$/u.test(expression.expression.getText()) &&
            expression.arguments.every(
              (argument) => !ts.isNewExpression(argument),
            )
          ) {
            categories["re-freezing an already-built error"]++;
          }
        }

        if (ts.isConditionalExpression(node)) {
          const both = [node.whenTrue, node.whenFalse].map((branch) =>
            headOfExpression(branch),
          );

          if (both.every((head) => isClosedBracket(head))) {
            categories["the message is chosen by a ternary"]++;
          }
        }

        ts.forEachChild(node, walk);
      };

      walk(source);
    }
  }

  console.log("over EVERY `new RouterError` in both packages:", categories);
  console.log(
    `dynamic doors (the head opens \`[router.\` and never closes): see the partition above`,
  );

  console.log(
    "\n⚠ NOT mechanical, so NOT owned here: which category a site belongs to when two\n" +
      "  apply, and whether a door can REACH its message (no core reachability check\n" +
      "  exists — #2479). Everything printed above is a count this script re-derives.",
  );
}

// Run main() only when invoked directly (`node scripts/refusal-census.mjs`),
// not when the fixture test imports `raiserTag`. ⚠ `import.meta.main`, not a
// comparison of `import.meta.url` with `file://${argv[1]}`: Node resolves a main
// module's symlinks and its URL escapes a space, so that comparison fails on
// such a path and main() never runs (#2539).
if (import.meta.main) {
  main();
}
