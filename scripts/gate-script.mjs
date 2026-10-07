// gate-script.mjs — what the gate's `Determine result` script reads and calls,
// read closed.
//
// `ci-gate-completeness.test.mjs` executes the script over every state of its
// table, and the table sees only what the harness passes: the expressions it
// substitutes and the step's `env:`. On GitHub the script sees more — the
// runner's `GITHUB_*` and `RUNNER_*` variables, the workflow's `env:`, the
// event file — and a branch on any of them would pass every state there. So
// the script is read as a closed list of the forms it uses, and any other form
// throws, naming it:
//
//   - it reads the variables its step passes and its own, and `$1`–`$9` inside
//     a function it defines; every expansion of a variable sits in double
//     quotes;
//   - it sets a variable of its own first at its top level, as the first
//     command of its `&&`/`||` list and before any read of it — not inside an
//     `if`, a `case` branch, a `{ }` group or a function, nor in a later arm —
//     so every path that reads the variable has set it; a variable its step
//     passes is set already;
//   - it neither reads nor sets a variable bash sets itself (`BASH_SETS`, and
//     any name that starts with `BASH`): a read of one need not return what
//     the script or its step set;
//   - it calls `echo`, `exit` with a number, its own functions, and `jq` in
//     one form, the value of an assignment on one line: `$(jq [-r] [--slurp]
//     '<program>' <<<"$<a variable its step passes>")`, the program's words
//     from `JQ_WORDS`;
//   - it defines a function at its top level, like a variable's first
//     assignment, under a name no bash builtin takes (`BUILTINS`) and not the
//     one bash calls by itself, so a call of one runs the script's function
//     and nothing else;
//   - it names no variable of its own `PATH` or `HOME`: the first decides
//     which `jq` runs, the second which `$HOME/.jq` it sources.
//
// The cells of the test name each form refused, and the test holds that a
// cell reaches every place the reader refuses: each call of `refuse`, and of
// the functions a refusal passes through on its way out.

import { REFUSED_CHARACTERS } from "./refused-characters.mjs";

/** What the script calls besides `jq` and the functions it defines. */
const CALLS = new Set(["echo", "exit"]);

/** Words the shell reserves; the reader takes `if`, `case` and the braces. */
const RESERVED = new Set([
  "!",
  "[[",
  "]]",
  "{",
  "}",
  "case",
  "coproc",
  "do",
  "done",
  "elif",
  "else",
  "esac",
  "fi",
  "for",
  "function",
  "if",
  "in",
  "select",
  "then",
  "time",
  "until",
  "while",
]);

/** A variable of the script's own may not take these names. */
const STEERING = new Set(["PATH", "HOME"]);

/**
 * The variables bash sets itself whose names do not start with `BASH`, as
 * `compgen -v` lists them in bash 5.2 and 3.2 started in an empty environment:
 * at the top level, inside a function, and after `[[ =~ ]]`, `read` and
 * `getopts`. A read of one need not return what was set: `LINENO` gives the
 * line, `SECONDS` the time, `_` the last argument.
 */
const BASH_SETS = new Set([
  "COMP_WORDBREAKS",
  "DIRSTACK",
  "EPOCHREALTIME",
  "EPOCHSECONDS",
  "EUID",
  "FUNCNAME",
  "GROUPS",
  "HISTCMD",
  "HOSTNAME",
  "HOSTTYPE",
  "IFS",
  "LINENO",
  "MACHTYPE",
  "OPTARG",
  "OPTERR",
  "OPTIND",
  "OSTYPE",
  "PATH",
  "PIPESTATUS",
  "PPID",
  "PS4",
  "PWD",
  "RANDOM",
  "REPLY",
  "SECONDS",
  "SHELL",
  "SHELLOPTS",
  "SHLVL",
  "SRANDOM",
  "TERM",
  "UID",
  "_",
]);

/** Whether bash sets a variable of this name itself. */
const bashSets = (name) => BASH_SETS.has(name) || name.startsWith("BASH");

/**
 * The function bash calls by itself: from bash 4, a command that is not found
 * runs it in its place.
 */
const CALLED_BY_BASH = "command_not_found_handle";

/**
 * The builtins of bash 5.2 and 3.2, as `compgen -b` lists them. A function of
 * the script's own takes none of these names: in posix mode, which setting
 * `POSIXLY_CORRECT` turns on, a special builtin runs in place of a function
 * of its name.
 */
const BUILTINS = new Set([
  ".",
  ":",
  "[",
  "alias",
  "bg",
  "bind",
  "break",
  "builtin",
  "caller",
  "cd",
  "command",
  "compgen",
  "complete",
  "compopt",
  "continue",
  "declare",
  "dirs",
  "disown",
  "echo",
  "enable",
  "eval",
  "exec",
  "exit",
  "export",
  "false",
  "fc",
  "fg",
  "getopts",
  "hash",
  "help",
  "history",
  "jobs",
  "kill",
  "let",
  "local",
  "logout",
  "mapfile",
  "popd",
  "printf",
  "pushd",
  "pwd",
  "read",
  "readarray",
  "readonly",
  "return",
  "set",
  "shift",
  "shopt",
  "source",
  "suspend",
  "test",
  "times",
  "trap",
  "true",
  "type",
  "typeset",
  "ulimit",
  "umask",
  "unalias",
  "unset",
  "wait",
]);

/** The words of the `jq` program, field names aside. */
const JQ_WORDS = new Set([
  "and",
  "else",
  "end",
  "error",
  "if",
  "length",
  "select",
  "then",
  "to_entries",
  "type",
]);

const JQ_OPTIONS = new Set(["-r", "--slurp"]);

const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** The characters of an unquoted word. */
const UNQUOTED = /[A-Za-z0-9_=!*{}[\]-]/;

/** An unquoted argument: no glob, no brace. */
const ARGUMENT = /^[A-Za-z0-9_=!-]+$/;

/**
 * @param {string} form
 * @returns {never}
 */
function refuse(form) {
  throw new Error(`the gate's script ${form}`);
}

/** The text of a form for a message: up to its end, at most 24 characters. */
const shown = (text, from) =>
  JSON.stringify(/^[^\s"]{0,24}/.exec(text.slice(from))[0]);

/**
 * The script's tokens: words of segments, operators and line ends. Inside
 * `$(`, the tokens up to its `)`.
 *
 * @param {string} text
 * @param {number} from
 * @param {boolean} inner
 * @returns {{ tokens: any[], end: number }}
 */
function lex(text, from = 0, inner = false) {
  const tokens = [];
  let i = from;

  while (i < text.length) {
    const c = text[i];

    if (c === " ") {
      i++;
      continue;
    }
    if (c === "\n") {
      tokens.push({ type: "newline" });
      i++;
      continue;
    }
    if (c === "#") {
      while (i < text.length && text[i] !== "\n") i++;
      continue;
    }
    if (inner && c === ")") return { tokens, end: i + 1 };

    const op = ["<<<", "&&", "||", ";;", ";", "(", ")"].find((each) =>
      text.startsWith(each, i),
    );
    if (op) {
      tokens.push({ type: "op", value: op });
      i += op.length;
      continue;
    }

    const segments = [];
    while (i < text.length) {
      const d = text[i];

      if (d === '"') {
        const segment = { type: "dq", parts: [] };
        let literal = "";
        i++;
        for (;;) {
          if (i >= text.length) refuse("has an unterminated double quote");
          const e = text[i];
          if (e === '"') {
            i++;
            break;
          }
          if (e === "\\" || e === "`") refuse(`quotes a ${e}`);
          if (e !== "$") {
            literal += e;
            i++;
            continue;
          }
          if (literal) segment.parts.push({ type: "text", value: literal });
          literal = "";
          if (text.startsWith("${{", i)) {
            let end = i + 3;
            let quoted = false;
            for (; end < text.length; end++) {
              if (text[end] === "'") quoted = !quoted;
              else if (!quoted && text.startsWith("}}", end)) break;
            }
            if (end >= text.length) refuse("has an unterminated ${{");
            segment.parts.push({
              type: "expression",
              value: text.slice(i + 3, end).trim(),
            });
            i = end + 2;
            continue;
          }
          const name = /^[A-Za-z_][A-Za-z0-9_]*/.exec(text.slice(i + 1));
          if (name) {
            segment.parts.push({ type: "read", name: name[0] });
            i += 1 + name[0].length;
            continue;
          }
          if (/[1-9]/.test(text[i + 1] ?? "")) {
            segment.parts.push({ type: "positional", name: text[i + 1] });
            i += 2;
            continue;
          }
          refuse(`expands a form it does not use: ${shown(text, i)}`);
        }
        if (literal) segment.parts.push({ type: "text", value: literal });
        segments.push(segment);
        continue;
      }
      if (d === "'") {
        const end = text.indexOf("'", i + 1);
        if (end === -1) refuse("has an unterminated single quote");
        segments.push({ type: "sq", value: text.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
      if (d === "$") {
        if (text[i + 1] !== "(") {
          refuse(`expands outside double quotes: ${shown(text, i)}`);
        }
        const inside = lex(text, i + 2, true);
        segments.push({ type: "subst", tokens: inside.tokens });
        i = inside.end;
        continue;
      }
      if (UNQUOTED.test(d)) {
        let value = "";
        while (i < text.length && UNQUOTED.test(text[i])) value += text[i++];
        segments.push({ type: "word", value });
        continue;
      }
      if (d === "#") {
        refuse("has a # inside a word, which the shell takes for text");
      }
      if (" \n;&|()<>".includes(d)) break;
      refuse(`uses a character it does not: ${JSON.stringify(d)}`);
    }

    if (segments.length === 0) {
      refuse(`uses a character it does not: ${JSON.stringify(text[i])}`);
    }
    tokens.push({ type: "word", segments });
  }

  if (inner) refuse("has an unterminated $(");
  return { tokens, end: i };
}

/** The literal of a word of one unquoted segment. */
const plain = (token) =>
  token?.type === "word" &&
  token.segments.length === 1 &&
  token.segments[0].type === "word"
    ? token.segments[0].value
    : undefined;

/** A segment as the script spells it. */
function spelled(segment) {
  if (segment.type === "word") return segment.value;
  if (segment.type === "sq") return `'${segment.value}'`;
  if (segment.type === "subst") return "$(…)";
  const parts = segment.parts.map((part) => {
    if (part.type === "text") return part.value;
    if (part.type === "expression") return `\${{ ${part.value} }}`;
    return `$${part.name}`;
  });
  return `"${parts.join("")}"`;
}

/** A token, for a message. */
function describe(token) {
  if (token === undefined) return "the end";
  if (token.type === "newline") return "a line end";
  if (token.type === "op") return `"${token.value}"`;
  return `the word ${token.segments.map(spelled).join("")}`;
}

/**
 * Throws unless a `jq` program uses only the words of `JQ_WORDS` and field
 * names: no `$`, so neither `$ENV` nor a variable, and no `@`.
 *
 * @param {string} program
 */
function readJqProgram(program) {
  let i = 0;

  const scan = (depth) => {
    while (i < program.length) {
      const c = program[i];

      if (c === " " || c === "\n") {
        i++;
        continue;
      }
      if (c === "#") {
        while (i < program.length && program[i] !== "\n") i++;
        continue;
      }
      if (c === '"') {
        i++;
        for (;;) {
          if (i >= program.length) refuse("has a jq string that does not end");
          const e = program[i];
          if (e === '"') {
            i++;
            break;
          }
          if (e === "\\") {
            const f = program[i + 1] ?? "";
            if (f === "(") {
              i += 2;
              scan(1);
              continue;
            }
            if (!'"\\/bfnrt'.includes(f)) {
              refuse(`has a jq escape it does not use: \\${f}`);
            }
            i += 2;
            continue;
          }
          i++;
        }
        continue;
      }
      if (c === "(") {
        i++;
        scan(depth + 1);
        continue;
      }
      if (c === ")") {
        if (depth === 0) refuse("has an unbalanced ) in its jq program");
        i++;
        return;
      }
      if (/[A-Za-z_]/.test(c)) {
        const word = /^[A-Za-z_][A-Za-z0-9_]*/.exec(program.slice(i))[0];
        if (program[i - 1] !== "." && !JQ_WORDS.has(word)) {
          refuse(`calls jq's ${word}, which is outside its closed list`);
        }
        i += word.length;
        continue;
      }
      if (/[0-9.|,[\]=!<>+*/%?-]/.test(c)) {
        i++;
        continue;
      }
      refuse(`has a jq character it does not use: ${JSON.stringify(c)}`);
    }
    if (depth > 0) refuse("has an unbalanced ( in its jq program");
  };

  scan(0);
}

/**
 * What the gate's script reads and calls, and the literals it compares with
 * in `[[ ]]` and `case`. A form outside the closed list throws an error that
 * names it.
 *
 * @param {string} run the step's `run:`
 * @param {Iterable<string>} stepEnv the names its `env:` binds
 * @returns {{ reads: Set<string>, calls: Set<string>, literals: Set<string> }}
 */
export function readGateScript(run, stepEnv) {
  if (REFUSED_CHARACTERS.test(run)) {
    refuse("has a control character, a tab or a line separator");
  }

  const passed = new Set(stepEnv);
  const assigned = new Set();
  const functions = new Set();
  const reads = new Set();
  const calls = new Set();
  const literals = new Set();
  /** What a command stands inside, the innermost last; empty at the top level. */
  const within = [];
  const { tokens } = lex(run);
  let at = 0;
  let inFunction = false;

  /** Reads `read` inside `place`. */
  const inside = (place, read) => {
    within.push(place);
    read();
    within.pop();
  };

  const peek = () => tokens[at];
  const next = () => tokens[at++];
  const isOp = (token, value) => token?.type === "op" && token.value === value;
  const skipLineEnds = () => {
    while (peek()?.type === "newline") at++;
  };
  const expect = (word) => {
    const token = next();
    if (plain(token) !== word) {
      refuse(`has ${describe(token)} where ${word} belongs`);
    }
  };

  const readOf = (part) => {
    if (part.type === "positional") {
      if (!inFunction) refuse(`reads $${part.name} outside a function`);
    } else if (part.type === "read") {
      if (bashSets(part.name)) {
        refuse(`reads $${part.name}, which bash sets itself`);
      }
      if (!passed.has(part.name) && !assigned.has(part.name)) {
        refuse(
          `reads $${part.name}, which neither its step passes nor it sets`,
        );
      }
      reads.add(part.name);
    }
  };

  /** A word of one double-quoted segment, its reads checked. */
  const quoted = (token, what) => {
    if (
      token?.type !== "word" ||
      token.segments.length !== 1 ||
      token.segments[0].type !== "dq"
    ) {
      refuse(`has ${describe(token)} where a double-quoted ${what} belongs`);
    }
    token.segments[0].parts.forEach(readOf);
    return token.segments[0].parts;
  };

  const jqCall = (subst) => {
    // bash ends a command at a line end inside `$( )`.
    if (subst.tokens.some((token) => token.type === "newline")) {
      refuse("ends a line inside $( )");
    }
    const inner = subst.tokens;
    if (plain(inner[0]) !== "jq") {
      refuse(`substitutes ${describe(inner[0])}, not jq`);
    }
    let k = 1;
    while (JQ_OPTIONS.has(plain(inner[k]) ?? "")) k++;
    const program = inner[k];
    if (
      program?.type !== "word" ||
      program.segments.length !== 1 ||
      program.segments[0].type !== "sq"
    ) {
      refuse(
        `passes jq ${describe(program)} where its single-quoted program belongs`,
      );
    }
    readJqProgram(program.segments[0].value);
    if (!isOp(inner[k + 1], "<<<")) {
      refuse(`gives jq ${describe(inner[k + 1])} where its <<< input belongs`);
    }
    const parts = quoted(inner[k + 2], "input");
    if (
      parts.length !== 1 ||
      parts[0].type !== "read" ||
      !passed.has(parts[0].name)
    ) {
      refuse("gives jq an input other than one variable its step passes");
    }
    if (inner.length !== k + 3) {
      refuse(`gives jq ${describe(inner[k + 3])} after its input`);
    }
    calls.add("jq");
  };

  /** Reads an assignment; false when the word is none. */
  const assignment = (token) => {
    const [first, ...value] = token.segments;
    const match =
      first.type === "word"
        ? /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(first.value)
        : null;
    if (!match) return false;
    const [, name, rest] = match;
    if (STEERING.has(name)) {
      refuse(`sets ${name}, which decides what jq runs or loads`);
    }
    if (bashSets(name)) refuse(`sets ${name}, which bash sets itself`);
    if (rest !== "") {
      if (!/^[0-9]+$/.test(rest) || value.length > 0) {
        refuse(`sets ${name} to a form it does not use`);
      }
    } else if (value.length === 1 && value[0].type === "dq") {
      value[0].parts.forEach(readOf);
    } else if (value.length === 1 && value[0].type === "subst") {
      jqCall(value[0]);
    } else {
      refuse(`sets ${name} to a form it does not use`);
    }
    if (!assigned.has(name) && !passed.has(name) && within.length > 0) {
      refuse(
        `sets ${name} first inside ${within.at(-1)}, not at its top level`,
      );
    }
    assigned.add(name);
    return true;
  };

  /** Keeps a word that expands nothing among the literals. */
  const keepLiteral = (token) => {
    const text = [];
    for (const segment of token.segments) {
      if (segment.type === "word") {
        text.push(segment.value);
      } else if (
        segment.type === "dq" &&
        segment.parts.every((part) => part.type === "text")
      ) {
        text.push(segment.parts.map((part) => part.value).join(""));
      } else {
        return;
      }
    }
    literals.add(text.join(""));
  };

  /** A double-quoted operand of `[[ ]]`; a literal one is kept. */
  const operand = (token) => {
    quoted(token, "operand");
    keepLiteral(token);
  };

  const test = () => {
    for (;;) {
      const token = next();
      const word = plain(token);
      if (word === "-n" || word === "-z") {
        quoted(next(), "operand");
      } else {
        operand(token);
        const op = plain(next());
        if (op !== "==" && op !== "!=") {
          refuse(
            `compares with ${op ?? "a form"} it does not use inside [[ ]]`,
          );
        }
        operand(next());
      }
      const after = peek();
      if (plain(after) === "]]") {
        at++;
        return;
      }
      if (!isOp(after, "&&") && !isOp(after, "||")) {
        refuse(`has ${describe(after)} inside [[ ]]`);
      }
      at++;
    }
  };

  const command = () => {
    const token = peek();
    const word = plain(token);

    if (word === "[[") {
      at++;
      test();
      return;
    }
    if (word === "if") {
      at++;
      inside("an if", () => {
        list(["then"]);
        expect("then");
        list(["else", "elif", "fi"]);
        if (plain(peek()) === "elif") refuse("uses elif");
        if (plain(peek()) === "else") {
          at++;
          list(["fi"]);
        }
        expect("fi");
      });
      return;
    }
    if (word === "case") {
      at++;
      quoted(next(), "subject");
      expect("in");
      skipLineEnds();
      while (plain(peek()) !== "esac") {
        const pattern = next();
        if (!/^(?:[a-z][a-z_-]*|\*)$/.test(plain(pattern) ?? "")) {
          refuse(`has a case pattern it does not use: ${describe(pattern)}`);
        }
        if (plain(pattern) !== "*") literals.add(plain(pattern));
        if (!isOp(next(), ")")) refuse("has a case pattern without its )");
        inside("a case branch", () => list([], [";;"], true));
        if (!isOp(next(), ";;")) refuse("ends a case branch without ;;");
        skipLineEnds();
      }
      at++;
      return;
    }
    if (word === "{") {
      at++;
      inside("a { } group", () => list(["}"]));
      expect("}");
      return;
    }
    if (word !== undefined && NAME.test(word) && isOp(tokens[at + 1], "(")) {
      if (
        RESERVED.has(word) ||
        CALLS.has(word) ||
        BUILTINS.has(word) ||
        word === "jq" ||
        word === CALLED_BY_BASH ||
        functions.has(word)
      ) {
        refuse(`defines a function named ${word}`);
      }
      if (inFunction) refuse("defines a function inside a function");
      if (within.length > 0) {
        refuse(`defines ${word} inside ${within.at(-1)}, not at its top level`);
      }
      at++;
      if (!isOp(next(), "(") || !isOp(next(), ")")) {
        refuse(`defines ${word} in a form it does not use`);
      }
      if (plain(peek()) !== "{") refuse(`defines ${word} without a { } body`);
      functions.add(word);
      inFunction = true;
      at++;
      inside("a function", () => list(["}"]));
      expect("}");
      inFunction = false;
      return;
    }
    if (token?.type !== "word") {
      refuse(`has ${describe(token)} where a command belongs`);
    }
    if (assignment(token)) {
      at++;
      if (peek()?.type === "word")
        refuse("sets a variable in front of a command");
      return;
    }
    if (word === undefined || RESERVED.has(word)) {
      refuse(`has ${describe(token)} where a command belongs`);
    }
    if (word === "jq") refuse("calls jq outside the value of an assignment");
    if (word === "exit") {
      at++;
      if (!/^[0-9]+$/.test(plain(next()) ?? "")) {
        refuse("exits with something other than a number");
      }
      calls.add(word);
      return;
    }
    if (word !== "echo" && !functions.has(word)) {
      refuse(`calls ${word}, which is outside its closed list`);
    }
    at++;
    while (peek()?.type === "word") {
      const argument = next();
      for (const segment of argument.segments) {
        if (segment.type === "dq") segment.parts.forEach(readOf);
        else if (segment.type !== "word" || !ARGUMENT.test(segment.value)) {
          refuse(`passes ${word} ${describe(argument)}`);
        }
      }
      // A function's arguments are what its `[[ ]]` compares `$1`–`$9` with.
      if (functions.has(word)) keepLiteral(argument);
    }
    calls.add(word);
  };

  const andOr = () => {
    command();
    while (isOp(peek(), "&&") || isOp(peek(), "||")) {
      at++;
      skipLineEnds();
      inside("an && or || arm", command);
    }
  };

  /**
   * Commands up to a word of `stopWords`, an operator of `stopOps` or the end.
   * As bash reads it, a reserved word ends the list only after `;` or a line
   * end, a `;` stands only after a command, and the list holds a command
   * unless `empty` allows none — a case branch may be empty, a body may not.
   */
  function list(stopWords, stopOps = [], empty = false) {
    let commands = 0;

    for (;;) {
      skipLineEnds();
      const token = peek();
      if (
        token === undefined ||
        stopWords.includes(plain(token) ?? "") ||
        (token.type === "op" && stopOps.includes(token.value))
      ) {
        if (commands === 0 && !empty) {
          refuse(`has ${describe(token)} where a command belongs`);
        }
        return;
      }
      andOr();
      commands++;
      const after = peek();
      if (isOp(after, ";")) {
        at++;
        continue;
      }
      if (after === undefined || after.type === "newline") continue;
      if (after.type === "op" && stopOps.includes(after.value)) return;
      refuse(`has ${describe(after)} after a command without ; or a line end`);
    }
  }

  list([]);

  return { reads, calls, literals };
}
