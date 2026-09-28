import { execFileSync } from "node:child_process";
import {
  lstatSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * CLASS guard: no tracked text file carries a raw control byte.
 *
 * ⚠ **A raw NUL makes the whole file binary to the tools that search it.** rg
 * skips it in a directory search, `git grep` answers "Binary file … matches"
 * without the line, and `git show` prints `Bin` — a search that found nothing
 * never read the file. Measured on 2026-09-28: six tracked sources held raw
 * control bytes where an escape was meant, in key separators, string literals,
 * comments and a regex character class.
 *
 * ⚑ **The rule is the byte, not git's verdict.** Git reads a file with one raw
 * ESC, BEL or DEL as text, and that byte is still an invisible character an
 * escape was meant to spell. TAB and LF are the only C0 bytes admitted, and CR
 * only where it ends a CRLF.
 *
 * ⚠ Binary formats are named by extension, and the list is held to the tree
 * both ways: a listed extension no tracked file carries reddens a CONTROL cell,
 * and an unlisted binary format reddens the table until it is named here.
 */
const REPO_ROOT = path.resolve(__dirname, "../../../..");

/** The extensions of the tracked files that are binary by format. */
const BINARY_FORMATS: ReadonlySet<string> = new Set(["icns", "ico", "png"]);

/** Every tracked file matters here, a dot-directory's and the root's too. */
const PLACES = [
  ".changeset/",
  ".claude/",
  ".github/",
  ".husky/",
  "benchmarks/",
  "cross-router-bench/",
  "examples/",
  "packages/",
  "scripts/",
  "shared/",
] as const;

const TAB = 0x09;
const LF = 0x0a;
const CR = 0x0d;
const DEL = 0x7f;

interface Offender {
  readonly file: string;
  /** The 1-based line of the first forbidden byte. */
  readonly line: number;
  /** Every distinct forbidden byte, ascending. */
  readonly bytes: readonly string[];
}

/**
 * Every file git TRACKS — the question is about the repository, not about the
 * disk it is checked out on, and tracking is what reaches the dot-directories.
 * `GIT_DIR` and its siblings are stripped: a hook runs this suite with the
 * environment of whichever worktree fired it.
 */
function trackedFiles(): string[] {
  const env = { ...process.env };

  delete env.GIT_DIR;
  delete env.GIT_WORK_TREE;
  delete env.GIT_INDEX_FILE;

  // `git` is the tool this repository is checked out with, the argument list is
  // fixed and carries no caller input, and asking git is the only way to learn
  // what is TRACKED.
  // eslint-disable-next-line sonarjs/no-os-command-from-path -- see the three lines above
  return execFileSync("git", ["ls-files", "-z"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    env,
    maxBuffer: 64 * 1024 * 1024,
  })
    .split("\0")
    .filter(Boolean);
}

function extensionOf(file: string): string {
  const name = path.basename(file);
  const dot = name.lastIndexOf(".");

  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

/**
 * The files the scan reads: regular files, bar the binary formats.
 *
 * ⚠ A tracked symlink is skipped rather than followed — it stores a path, and
 * the file it names is tracked in its own right. A tracked file missing from
 * the checkout is skipped too; that is git's to report, not this table's.
 */
function textFiles(files: readonly string[], root = REPO_ROOT): string[] {
  return files.filter((file) => {
    if (BINARY_FORMATS.has(extensionOf(file))) {
      return false;
    }

    const stat = lstatSync(path.resolve(root, file), {
      throwIfNoEntry: false,
    });

    return stat?.isFile() === true;
  });
}

function isForbidden(byte: number, next: number | undefined): boolean {
  if (byte === TAB || byte === LF) {
    return false;
  }

  if (byte === CR) {
    return next !== LF;
  }

  return byte < 0x20 || byte === DEL;
}

function inspect(file: string, buffer: Buffer): Offender | undefined {
  const found = new Set<number>();
  let line = 1;
  let first = 0;

  for (const [index, byte] of buffer.entries()) {
    if (isForbidden(byte, buffer[index + 1])) {
      found.add(byte);
      first ||= line;
    }

    if (byte === LF) {
      line += 1;
    }
  }

  if (found.size === 0) {
    return undefined;
  }

  return {
    file,
    line: first,
    bytes: [...found]
      .toSorted((a, b) => a - b)
      .map((byte) => `0x${byte.toString(16).toUpperCase().padStart(2, "0")}`),
  };
}

function scan(files: readonly string[], root = REPO_ROOT): Offender[] {
  const rows: Offender[] = [];

  for (const file of textFiles(files, root)) {
    const row = inspect(file, readFileSync(path.resolve(root, file)));

    if (row !== undefined) {
      rows.push(row);
    }
  }

  return rows.toSorted((a, b) => a.file.localeCompare(b.file));
}

describe("no tracked text file carries a raw control byte", () => {
  it("every tracked text file is free of forbidden bytes", () => {
    expect(scan(trackedFiles())).toStrictEqual([]);
  });

  it("CONTROL — the scan FINDS each forbidden byte, and admits TAB, LF and CRLF", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "control-byte-"));

    try {
      const fixtures: Record<string, string> = {
        "nul.mjs": "const key = `a\0b`;\n",
        "lone-cr.md": "one\rtwo\n",
        "esc.ts": "export const a = 1;\n// \u001B[31m red\n",
        "del.txt": "a\u007Fb\n",
        // NEGATIVE arms: the admitted bytes, and a format named as binary.
        "clean.ts": "\tindented\r\nwindows line\nunix line\n",
        "image.png": "\0\u0001\u0002",
      };

      for (const [name, text] of Object.entries(fixtures)) {
        writeFileSync(path.join(directory, name), text);
      }

      // NEGATIVE arms: a symlink onto an offender, and a file that is gone.
      symlinkSync("nul.mjs", path.join(directory, "link.mjs"));

      expect(
        scan([...Object.keys(fixtures), "link.mjs", "gone.ts"], directory),
      ).toStrictEqual([
        { file: "del.txt", line: 1, bytes: ["0x7F"] },
        { file: "esc.ts", line: 2, bytes: ["0x1B"] },
        { file: "lone-cr.md", line: 1, bytes: ["0x0D"] },
        { file: "nul.mjs", line: 1, bytes: ["0x00"] },
      ]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("CONTROL — every listed binary format is one the tree carries", () => {
    const carried = new Set(trackedFiles().map((file) => extensionOf(file)));

    expect(
      [...BINARY_FORMATS].filter((format) => !carried.has(format)),
    ).toStrictEqual([]);
  });

  it("CONTROL — the scan READS the dot-directories, the workspaces and the root", () => {
    // ⚑ The table cannot pin its own reach: a narrower filter finds fewer
    // offenders only where one exists, so with nothing to find it stays green
    // while reading nothing.
    const read = textFiles(trackedFiles());

    expect(
      PLACES.filter((place) => read.every((file) => !file.startsWith(place))),
    ).toStrictEqual([]);
    expect(read).toContain("package.json");
  });
});
