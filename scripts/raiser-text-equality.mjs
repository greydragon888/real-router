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
const CONSTRUCTORS = new Set([...PLAIN, "RouterError"]);

// `new RouterError(code, { message })` carries its message in the bag, so a reader
// that only looks at `arguments[0]` sees no head at all.
const bagMessage = (args) => {
  const bag = args.find((a) => ts.isObjectLiteralExpression(a));

  if (!bag) return undefined;

  const entry = bag.properties.find(
    (x) => x.name !== undefined && x.name.getText() === "message",
  );

  return entry && ts.isPropertyAssignment(entry)
    ? entry.initializer
    : undefined;
};

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
  // ⚠ The BODY, head stripped, is a second comparison and step 6 is why. When a
  // family's head changes on purpose every member is lost-and-new at once, so the
  // head diff says nothing about whether a body moved with it.
  const bodies = new Set();

  const headOfBinding = (declaration) => {
    const [r, d] = declaration.initializer.arguments;

    if (!r || !ts.isStringLiteral(r)) return undefined;

    return d === undefined
      ? `[${r.text}] `
      : ts.isStringLiteral(d)
        ? `[${r.text}.${d.text}] `
        : `[${r.text}.\${}] `;
  };

  const isBinding = (n) =>
    ts.isVariableDeclaration(n) &&
    ts.isIdentifier(n.name) &&
    n.initializer !== undefined &&
    ts.isCallExpression(n.initializer) &&
    n.initializer.expression.getText(src) === "raiser";

  const walk = (n, outer) => {
    let scope = outer;

    // ⚠ A scope's bindings are hoisted before its children are walked. Resolving
    // them in TEXTUAL order lost three heads when `RouterError.ts` moved its
    // bindings below the class that uses them — legal, since a method resolves the
    // binding when it runs, not where it is written.
    if (ts.isBlock(n) || ts.isSourceFile(n) || ts.isModuleBlock(n)) {
      scope = new Map(outer);

      for (const statement of n.statements)
        if (ts.isVariableStatement(statement))
          for (const declaration of statement.declarationList.declarations)
            if (isBinding(declaration)) {
              const head = headOfBinding(declaration);

              if (head !== undefined) scope.set(declaration.name.text, head);
            }
    }

    // ⚠ Wherever the refusal is BUILT, not only where it is thrown. A third of
    // this family is delivered by `Promise.reject`, by a `const` the caller reports
    // before throwing, or by a module-cached instance — a throw-only reader reports
    // each of those as `new` with nothing to compare against.
    if (ts.isNewExpression(n) && CONSTRUCTORS.has(n.expression.getText(src))) {
      const args = [...(n.arguments ?? [])];
      const head = shape(bagMessage(args) ?? args[0], src);

      if (head && /^\[[A-Za-z]+(\.([\w.]+|\$\{\}))?\]\s/u.test(head)) {
        out.add(head);
        bodies.add(head.replace(/^\[[^\]]*\]\s/u, ""));
      }
    }

    if (ts.isTaggedTemplateExpression(n)) {
      const tag = n.tag;
      const member = ts.isCallExpression(tag) ? tag.expression : tag;

      if (
        ts.isPropertyAccessExpression(member) &&
        ts.isIdentifier(member.expression)
      ) {
        // `internalDefect` is a module-level constant rather than a binding, and
        // its head is fixed. ⚠ Without this the whole marker family was outside
        // the comparison: measured on step 6, appending a period to three bodies
        // left the FSM suite 76/76 green, because its pins are `toThrow(string)`
        // and that is substring containment.
        const head =
          member.expression.text === "internalDefect"
            ? "Internal error (please report): "
            : scope.get(member.expression.text);

        if (head !== undefined) {
          const body = shape(n.template, src);

          out.add(head + body);
          bodies.add(body);
        }
      }
    }

    ts.forEachChild(n, (c) => walk(c, scope));
  };

  walk(src, new Map());

  return { out, bodies };
};

const before = new Set(),
  after = new Set(),
  beforeBodies = new Set(),
  afterBodies = new Set();

for (const f of files) {
  // A file the branch ADDS has no `before` side. ⚠ Reading it as an error crashed
  // the guard outright, so it could not run on any branch that adds a file.
  let master = "";

  try {
    master = execFileSync("git", ["show", `origin/master:${f}`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    master = "";
  }

  const was = render(f, master);
  const now = render(f, readFileSync(f, "utf8"));

  for (const head of was.out) before.add(head);
  for (const body of was.bodies) beforeBodies.add(body);
  for (const head of now.out) after.add(head);
  for (const body of now.bodies) afterBodies.add(body);
}

const lostBodies = [...beforeBodies].filter((x) => !afterBodies.has(x));
const newBodies = [...afterBodies].filter((x) => !beforeBodies.has(x));

console.log(
  `  bodies: ${beforeBodies.size} → ${afterBodies.size}   lost: ${lostBodies.length}   new: ${newBodies.length}`,
);

for (const x of [...lostBodies, ...newBodies].slice(0, 6))
  console.log(`     body  ${x.slice(0, 86)}`);

const missing = [...before].filter((x) => !after.has(x));
const extra = [...after].filter((x) => !before.has(x));
console.log(`  before: ${before.size}   after: ${after.size}`);
console.log(`  lost:   ${missing.length}   new: ${extra.length}`);
for (const x of [...missing, ...extra].slice(0, 6))
  console.log(`     ${x.slice(0, 92)}`);
