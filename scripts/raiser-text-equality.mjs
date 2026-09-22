// raiser-text-equality.mjs — a converted refusal must render the same message SHAPE.
//
// Renders every message head+body TWICE — once from `origin/master`, once from the
// working tree — and compares the two sets. Each side reads both forms, the literal
// head and the head a `raiser` binding builds. Run it on every family a conversion
// touches: `node scripts/raiser-text-equality.mjs`.
//
// ⚠ A shape collapses every `${expr}` to `${}`, so swapping WHICH variable lands in
// which slot passes green. Measured on `EventEmitter.ts`: the swap is caught by the
// pins that spell the interpolated value, not by this guard.
//
// ⚠ It is not optional where the suite looks sufficient. Measured on the first
// multi-file family: 19 of 30 converted sites were pinned verbatim by a test and 11
// were not, and this guard caught a real defect in one of the eleven — a `" + "`
// junction left inside the message, invisible to a green suite.
//
// It reads both the working tree and the commits on the branch, so it measures a
// conversion in progress and one already landed.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import ts from "typescript";

// Committed AND uncommitted, because a conversion is measured both before it lands
// and after. ⚠ Two spellings of the file set each printed `lost: 0  new: 0` on work
// that WAS converted — `git diff --name-only` alone went quiet once the work was
// committed, and without `HEAD` it goes quiet again once the work is staged. An empty
// set is a REFUSAL, not a pass.
const files = [
  ...new Set(
    [
      ...execFileSync("git", ["diff", "--name-only", "HEAD"], {
        encoding: "utf8",
      }).split("\n"),
      ...execFileSync("git", ["diff", "--name-only", "origin/master...HEAD"], {
        encoding: "utf8",
      }).split("\n"),
    ].filter((f) => f.endsWith(".ts") && f.startsWith("packages/")),
  ),
];

if (files.length === 0) {
  console.error(
    "no changed .ts files against origin/master \u2014 nothing to compare, which is not a pass",
  );
  process.exit(1);
}
const PLAIN = new Set(["TypeError", "Error", "ReferenceError", "RangeError"]);

const shape = (n, s) => {
  if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n))
    return n.text;
  if (ts.isTemplateExpression(n))
    return (
      n.head.text + n.templateSpans.map((x) => "${}" + x.literal.text).join("")
    );
  if (
    ts.isBinaryExpression(n) &&
    n.operatorToken.kind === ts.SyntaxKind.PlusToken
  )
    return shape(n.left, s) + shape(n.right, s);
  return undefined;
};
const parse = (name, text) =>
  ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true);

// ONE renderer, run against both revisions. ⚠ It must read the literal form AND
// the binding form on EACH side: reading literals on the left only reported a file's
// EARLIER conversions as `new` the next time a step touched it, which is a false
// positive that grows with every step.
const render = (name, text) => {
  const src = parse(name, text);
  const out = new Set();

  const walk = (n, outer) => {
    const scope =
      ts.isBlock(n) || ts.isSourceFile(n) || ts.isModuleBlock(n)
        ? new Map(outer)
        : outer;

    if (
      ts.isVariableDeclaration(n) &&
      ts.isIdentifier(n.name) &&
      n.initializer &&
      ts.isCallExpression(n.initializer) &&
      n.initializer.expression.getText(src) === "raiser"
    ) {
      const [r, d] = n.initializer.arguments;

      if (r && ts.isStringLiteral(r))
        scope.set(
          n.name.text,
          d === undefined
            ? `[${r.text}] `
            : ts.isStringLiteral(d)
              ? `[${r.text}.${d.text}] `
              : `[${r.text}.\${}] `,
        );
    }

    if (ts.isThrowStatement(n)) {
      // the literal form
      if (
        ts.isNewExpression(n.expression) &&
        PLAIN.has(n.expression.expression.getText(src))
      ) {
        const head = shape(n.expression.arguments?.[0], src);

        if (head && /^\[router(\.([A-Za-z]+|\$\{\}))?\]\s/u.test(head))
          out.add(head);
      }

      // the binding form
      if (ts.isTaggedTemplateExpression(n.expression)) {
        const tag = n.expression.tag;
        const member = ts.isCallExpression(tag) ? tag.expression : tag;

        if (
          ts.isPropertyAccessExpression(member) &&
          ts.isIdentifier(member.expression)
        ) {
          const head = scope.get(member.expression.text);

          if (head !== undefined)
            out.add(head + shape(n.expression.template, src));
        }
      }
    }

    ts.forEachChild(n, (c) => walk(c, scope));
  };

  walk(src, new Map());

  return out;
};

const before = new Set(),
  after = new Set();

for (const f of files) {
  for (const head of render(
    f,
    execFileSync("git", ["show", `origin/master:${f}`], { encoding: "utf8" }),
  ))
    before.add(head);

  for (const head of render(f, readFileSync(f, "utf8"))) after.add(head);
}

const missing = [...before].filter((x) => !after.has(x));
const extra = [...after].filter((x) => !before.has(x));
console.log(`  before: ${before.size}   after: ${after.size}`);
console.log(`  lost:   ${missing.length}   new: ${extra.length}`);
for (const x of [...missing, ...extra].slice(0, 6))
  console.log(`     ${x.slice(0, 92)}`);
